import { z } from "zod";
import { zDatasetInfo } from "./ckan/schemas";
import { mkdtemp, writeFile, readdir, mkdir, rm } from "fs/promises";
import { basename, extname, join } from "path";
import { $ } from "bun";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { generateIndexes } from "./index-gen";

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

const DATOS_PRODUCCION_GOB_AR =
  process.env.DATOS_PRODUCCION_GOB_AR || "https://datos.produccion.gob.ar";
const processUrl = (url: string) =>
  url.replace(/^https:\/\/datos\.produccion\.gob\.ar/, DATOS_PRODUCCION_GOB_AR);

const s3 = new S3Client({
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  region: "us-west-004",
  credentials: {
    accessKeyId: B2_BUCKET_KEY_ID,
    secretAccessKey: B2_BUCKET_KEY,
  },
});

async function getRawDatasetInfo(attempts = 0) {
  try {
    const url = processUrl(
      "https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios"
    );
    return await $`curl -L ${url}`.json();
  } catch (error) {
    if (attempts >= 4) {
      console.error(
        `❌ Error fetching dataset info`,
        error,
        (error as { stderr: { toString: () => string } }).stderr.toString()
      );
      process.exit(1);
    }
    console.error(
      `❌ Error fetching dataset info`,
      error,
      `retrying in 30s...`
    );
    await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
    return await getRawDatasetInfo(attempts + 1);
  }
}
async function saveFileIntoRepo(fileName: string, fileContent: string) {
  const dir = await mkdtemp("/tmp/sepa-precios-archiver-metadata-repo-");
  try {
    await $`git clone https://catdevnull:${GITHUB_TOKEN}@github.com/catdevnull/sepa-precios-metadata.git ${dir}`;
    await writeFile(join(dir, fileName), fileContent);
    await $`cd ${dir} && git config user.email "git@nulo.in" && git config user.name "github actions"`;
    await $`cd ${dir} && git add ${fileName}`;
    await $`cd ${dir} && git diff --staged --quiet || git commit -m "Update ${fileName}"`;
    await $`cd ${dir} && git push origin main`;
  } finally {
    await $`rm -rf ${dir}`;
  }
  console.log(`✅ Saved ${fileName} into repo`);
}

async function checkFileExistsInB2(fileName: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: B2_BUCKET_NAME,
        Key: fileName,
      })
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
  fileContent: ReadableStream | Blob | string
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

await saveFileIntoRepo(
  "dataset-info.json",
  JSON.stringify(rawDatasetInfo, null, 2)
);

let errored = false;

function checkRes(
  res: Response
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
  JSON.stringify(rawDatasetInfo, null, 2)
);

const datasetInfo = z.object({ result: zDatasetInfo }).parse(rawDatasetInfo);
for (const resource of datasetInfo.result.resources) {
  if (extname(resource.url) === ".zip") {
    const fileName = `${resource.id}-revID-${resource.revision_id}-${basename(resource.url)}-repackaged.tar.zst`;
    if (await checkFileExistsInB2(fileName)) continue;
    console.log(`⬇️ Downloading, repackaging and uploading ${resource.url}`);
    const dir = await mkdtemp("/tmp/sepa-precios-archiver-repackage-");
    console.info(dir);
    try {
      const zip = join(dir, "zip");
      const url = processUrl(resource.url);
      await $`curl --retry 8 --retry-delay 5 --retry-all-errors -L -o ${zip} ${url}`;
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

      await writeFile(
        join(dir, "dataset-info.json"),
        JSON.stringify(rawDatasetInfo, null, 2)
      );

      const compressed =
        await $`tar -c -C ${dir} . | zstd -15 --long -T0`.blob();
      await uploadToB2Bucket(fileName, compressed);
    } finally {
      await $`rm -rf ${dir}`;
    }
  } else {
    const fileName = `${resource.id}-${basename(resource.url)}`;
    if (await checkFileExistsInB2(fileName)) continue;
    console.log(`⬇️ Downloading and reuploading ${resource.url}`);
    const response = await $`curl -L ${resource.url}`.blob();

    await uploadToB2Bucket(fileName, response);
  }
}
const { markdown, jsonIndex } = await generateIndexes();
await saveFileIntoRepo("index.md", markdown);
await saveFileIntoRepo("index.json", JSON.stringify(jsonIndex, null, 2));

if (errored) {
  process.exit(1);
}
