import { z } from "zod";
import { zDatasetInfo } from "./ckan/schemas";
import {
  mkdtemp,
  writeFile,
  readdir,
  mkdir,
  rm,
  stat,
  lstat,
} from "fs/promises";
import { basename, extname, join, relative } from "path";
import { $ } from "bun";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { generateIndexes } from "./index-gen";
import { createReadStream } from "fs";
import type { Readable } from "stream";

function sanitizeLogText(text: string) {
  return text
    .replace(
      /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
      "[redacted-ipv4]"
    )
    .replace(
      /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi,
      "[redacted-ipv6]"
    );
}

function extractStderr(error: unknown) {
  const stderr = (error as { stderr?: { toString: () => string } }).stderr;
  return stderr ? sanitizeLogText(stderr.toString().trim()) : undefined;
}

function logCommandError(prefix: string, error: unknown) {
  const stderr = extractStderr(error);
  if (stderr) {
    console.error(`${prefix}: ${stderr}`);
    return;
  }
  const message =
    error instanceof Error ? sanitizeLogText(error.message) : "unknown error";
  console.error(`${prefix}: ${message}`);
}

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
const PROXY_URI = process.env.PROXY_URI;
const CURL_PROXY_ARGS = PROXY_URI ? ["-x", PROXY_URI] : [];
const processUrl = (url: string) =>
  url.replace(/^https:\/\/datos\.produccion\.gob\.ar/, DATOS_PRODUCCION_GOB_AR);
const MIN_VALID_REPACKAGED_ARCHIVE_SIZE = 1024 * 1024;
const REQUIRED_DATASET_FILES = [
  "productos.csv",
  "sucursales.csv",
  "comercio.csv",
];

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
    return await $`curl ${CURL_PROXY_ARGS} -L ${url}`.json();
  } catch (error) {
    if (attempts >= 4) {
      logCommandError(`❌ Error fetching dataset info`, error);
      process.exit(1);
    }
    logCommandError(`❌ Error fetching dataset info, retrying in 30s`, error);
    await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
    return await getRawDatasetInfo(attempts + 1);
  }
}
async function saveFileIntoRepo(fileName: string, fileContent: string) {
  const dir = await mkdtemp("/tmp/sepa-precios-archiver-metadata-repo-");
  try {
    await $`git clone https://catdevnull-bot:${GITHUB_TOKEN}@github.com/catdevnull/sepa-precios-metadata.git ${dir}`;
    await writeFile(join(dir, fileName), fileContent);
    await $`cd ${dir} && git config user.email "bot@nulo.lol" && git config user.name "github actions"`;
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
    const result = await s3.send(
      new HeadObjectCommand({
        Bucket: B2_BUCKET_NAME,
        Key: fileName,
      })
    );
    if (
      fileName.endsWith("-repackaged.tar.zst") &&
      (result.ContentLength ?? 0) < MIN_VALID_REPACKAGED_ARCHIVE_SIZE
    ) {
      console.warn(
        `⚠️ ${fileName} exists but is only ${result.ContentLength ?? 0} bytes; repackaging again.`
      );
      return false;
    }
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
  fileContent: ReadableStream | Readable | Blob | string
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
    console.error(`❌ Error downloading resource`);
    errored = true;
    return false;
  }
  if (!res.body) throw new Error(`❌ No body in response`);
  return true;
}

async function listFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return await listFilesRecursively(path);
      return [path];
    })
  );
  return files.flat();
}

async function validateExtractedDataset(dir: string) {
  const files = await listFilesRecursively(dir);
  const relativeFiles = files.map((file) => relative(dir, file));
  const datasetDirs = new Set<string>();

  for (const file of relativeFiles) {
    if (REQUIRED_DATASET_FILES.includes(basename(file))) {
      datasetDirs.add(file.slice(0, -basename(file).length));
    }
  }

  const completeDatasetDirs = [...datasetDirs].filter((datasetDir) =>
    REQUIRED_DATASET_FILES.every((requiredFile) =>
      relativeFiles.includes(`${datasetDir}${requiredFile}`)
    )
  );

  if (completeDatasetDirs.length === 0) {
    throw new Error(
      `No extracted SEPA datasets found. Expected directories containing ${REQUIRED_DATASET_FILES.join(", ")}. Extracted files: ${relativeFiles.slice(0, 20).join(", ") || "(none)"}`
    );
  }

  return completeDatasetDirs.length;
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
    console.log(`⬇️ Downloading, repackaging and uploading ${fileName}`);
    const dir = await mkdtemp("/tmp/sepa-precios-archiver-repackage-");
    try {
      const zip = join(dir, "zip");
      const url = processUrl(resource.url);
      await $`curl ${CURL_PROXY_ARGS} --fail --show-error --retry 8 --retry-delay 5 --retry-all-errors -L -o ${zip} ${url}`.quiet();
      const downloadedZipSize = (await stat(zip)).size;
      if (
        resource.size > MIN_VALID_REPACKAGED_ARCHIVE_SIZE &&
        downloadedZipSize < resource.size * 0.9
      ) {
        throw new Error(
          `Downloaded ${downloadedZipSize} bytes for ${fileName}, expected about ${resource.size}`
        );
      }
      await $`unzip -q ${zip} -d ${dir}`;
      await rm(zip);
      async function unzipRecursively(dir: string) {
        for (const file of await readdir(dir)) {
          const path = join(dir, file);
          const stat = await lstat(path);

          if (stat.isDirectory()) {
            await unzipRecursively(path);
          } else if (extname(file) === ".zip") {
            const extractDir = join(dir, basename(file, ".zip"));
            await mkdir(extractDir, { recursive: true });
            try {
              await $`cd ${dir} && unzip -q ${path} -d ${extractDir}`;
              await rm(path);
              await unzipRecursively(extractDir);
            } catch {
              console.error(
                `⚠️ Failed to unzip nested archive ${basename(path)}. Keeping original and continuing.`
              );
            }
          }
        }
      }

      await unzipRecursively(dir);
      const datasetCount = await validateExtractedDataset(dir);
      console.log(`✅ Extracted ${datasetCount} SEPA dataset directories`);

      await writeFile(
        join(dir, "dataset-info.json"),
        JSON.stringify(rawDatasetInfo, null, 2)
      );

      const compressedPath = `${dir}.tar.zst`;
      try {
        await $`tar -c -C ${dir} . | zstd -15 --long -T0 -o ${compressedPath}`.quiet();
        const compressedSize = (await stat(compressedPath)).size;
        if (compressedSize < MIN_VALID_REPACKAGED_ARCHIVE_SIZE) {
          throw new Error(
            `Refusing to upload ${fileName}: compressed archive is only ${compressedSize} bytes`
          );
        }
        await uploadToB2Bucket(fileName, createReadStream(compressedPath));
      } finally {
        await rm(compressedPath, { force: true });
      }
    } finally {
      await $`rm -rf ${dir}`;
    }
  } else {
    const fileName = `${resource.id}-${basename(resource.url)}`;
    if (await checkFileExistsInB2(fileName)) continue;
    console.log(`⬇️ Downloading and reuploading ${fileName}`);
    const downloadDir = await mkdtemp("/tmp/sepa-precios-archiver-download-");
    try {
      const downloadPath = join(downloadDir, "download");
      await $`curl ${CURL_PROXY_ARGS} --fail --show-error -L -o ${downloadPath} ${resource.url}`.quiet();
      await uploadToB2Bucket(fileName, createReadStream(downloadPath));
    } finally {
      await rm(downloadDir, { recursive: true, force: true });
    }
  }
}
const { markdown, jsonIndex } = await generateIndexes();
await saveFileIntoRepo("index.md", markdown);
await saveFileIntoRepo("index.json", JSON.stringify(jsonIndex, null, 2));

if (errored) {
  process.exit(1);
}
