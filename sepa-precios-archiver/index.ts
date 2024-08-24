import { z } from "zod";
import { zDatasetInfo } from "./schemas";
import { mkdtemp, writeFile, readdir, mkdir, rm } from "fs/promises";
import { basename, extname, join } from "path";
import { $, write } from "bun";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

function checkEnvVariable(variableName: string) {
  const value = process.env[variableName];
  if (value) {
    console.log(`✅ ${variableName} is set`);
    return value;
  } else {
    console.log(`❌ ${variableName} is not set`);
    process.exit(1);
  }
}

const GITHUB_TOKEN = checkEnvVariable("GITHUB_TOKEN");
const B2_BUCKET_NAME = checkEnvVariable("B2_BUCKET_NAME");
const B2_BUCKET_KEY_ID = checkEnvVariable("B2_BUCKET_KEY_ID");
const B2_BUCKET_KEY = checkEnvVariable("B2_BUCKET_KEY");

const s3 = new S3Client({
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  region: "us-west-004",
  credentials: {
    accessKeyId: B2_BUCKET_KEY_ID,
    secretAccessKey: B2_BUCKET_KEY,
  },
});

async function getRawDatasetInfo() {
  const response = await fetch(
    "https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios",
  );
  const json = await response.json();
  return json;
}

async function saveDatasetInfoIntoRepo(datasetInfo: any) {
  const dir = await mkdtemp("/tmp/sepa-precios-archiver-metadata-repo-");
  try {
    await $`git clone https://catdevnull:${GITHUB_TOKEN}@github.com/catdevnull/sepa-precios-metadata.git ${dir}`;
    await writeFile(
      dir + "/dataset-info.json",
      JSON.stringify(datasetInfo, null, 2),
    );
    await $`cd ${dir} && git add dataset-info.json`;
    await $`cd ${dir} && git diff --staged --quiet || git commit -m "Update dataset info"`;
    await $`cd ${dir} && git push origin main`;
  } finally {
    await $`rm -rf ${dir}`;
  }
  console.log(`✅ Saved dataset info into repo`);
}

async function checkFileExistsInB2(fileName: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: B2_BUCKET_NAME,
        Key: fileName,
      }),
    );
    return true;
  } catch (error) {
    if ((error as any).name === "NotFound") {
      return false;
    }
    throw error;
  }
}

async function uploadToB2Bucket(
  fileName: string,
  fileContent: ReadableStream | Blob | string,
) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: B2_BUCKET_NAME,
      Key: fileName,
      Body: fileContent,
    },
  });

  await upload.done();
}

const rawDatasetInfo = await getRawDatasetInfo();

await saveDatasetInfoIntoRepo(rawDatasetInfo);

let errored = false;

function checkRes(
  res: Response,
): res is Response & { body: ReadableStream<Uint8Array> } {
  if (!res.ok) {
    console.error(`❌ Error downloading ${res.url}`);
    errored = true;
    return false;
  }
  if (!res.body) throw new Error(`❌ No body in response`);
  return true;
}

await uploadToB2Bucket(
  `timestamped-metadata/${new Date().toISOString()}.json`,
  JSON.stringify(rawDatasetInfo, null, 2),
);

const datasetInfo = z.object({ result: zDatasetInfo }).parse(rawDatasetInfo);
for (const resource of datasetInfo.result.resources) {
  if (extname(resource.url) === ".zip") {
    const fileName = `${resource.id}-${basename(resource.url)}-repackaged.tar.zst`;
    if (await checkFileExistsInB2(fileName)) continue;
    console.log(`⬇️ Downloading, repackaging and uploading ${resource.url}`);
    const dir = await mkdtemp("/tmp/sepa-precios-archiver-repackage-");
    console.info(dir);
    try {
      const response = await fetch(resource.url);
      if (!checkRes(response)) continue;
      // const response = Bun.file(
      //   `/Users/diablo/Downloads/dump precios justos/${basename(resource.url)}`,
      // );

      const zip = join(dir, "zip");
      await write(zip, response);
      await $`unzip ${zip} -d ${dir}`;
      await rm(zip);

      for (const file of await readdir(dir)) {
        const path = join(dir, file);
        if (extname(file) !== ".zip") continue;
        const extractDir = join(dir, basename(file, ".zip"));
        await mkdir(extractDir, { recursive: true });
        await $`cd ${dir} && unzip ${path} -d ${extractDir}`;
        await rm(path);
      }

      const compressed =
        await $`tar -c -C ${dir} ${dir} | zstd -15 --long -T0`.blob();
      await uploadToB2Bucket(fileName, compressed);
    } finally {
      await $`rm -rf ${dir}`;
    }
  } else {
    const fileName = `${resource.id}-${basename(resource.url)}`;
    if (await checkFileExistsInB2(fileName)) continue;
    console.log(`⬇️ Downloading and reuploading ${resource.url}`);
    const response = await fetch(resource.url);
    if (!checkRes(response)) continue;

    await uploadToB2Bucket(fileName, response.body);
  }
}

if (errored) {
  process.exit(1);
}
