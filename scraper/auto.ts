import "dotenv/config";
import { mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Supermercado } from "db-datos/supermercado.js";
import PQueue from "p-queue";
import { format, formatDuration, intervalToDuration } from "date-fns";
import { parseWarc } from "./scrap.js";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { BunFile } from "bun";

if (
  !process.env.S3_ACCESS_KEY_ID ||
  !process.env.S3_SECRET_ACCESS_KEY ||
  !process.env.S3_BUCKET_NAME
)
  throw new Error("missing s3 creds");
if (!process.env.TELEGRAM_BOT_TOKEN)
  console.warn("no hay TELEGRAM_BOT_TOKEN, no voy a loggear por allá");
if (!process.env.TELEGRAM_BOT_CHAT_ID)
  console.warn("no hay TELEGRAM_BOT_CHAT_ID, no voy a loggear por allá");
const { S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;

// https://www.backblaze.com/docs/cloud-storage-use-the-aws-sdk-for-javascript-v3-with-backblaze-b2
const s3 = new S3Client({
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  region: "us-west-004",
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

const supermercados: Supermercado[] = [
  Supermercado.Carrefour,
  Supermercado.Coto,
  Supermercado.Dia,
];

// hacemos una cola para la compresión para no sobrecargar la CPU
const compressionQueue = new PQueue({ concurrency: 1 });

// hacemos una cola para el scrapeo para no tener varios writers a la BD y no sobrecargar la CPU
const scrapQueue = new PQueue({ concurrency: 1 });

supermercados.forEach(downloadList);
// await recompress("sqlite.db.gz", "sqlite.db.zst");

async function downloadList(supermercado: Supermercado) {
  const listPath = resolve(
    join(process.env.LISTS_DIR ?? "../data", `${supermercado}.txt`)
  );
  const date = new Date();
  const ctxPath = await mkdtemp(join(tmpdir(), "preciazo-scraper-wget-"));
  const zstdWarcName = `${supermercado}-${format(
    date,
    "yyyy-MM-dd-HH:mm"
  )}.warc.zst`;
  const zstdWarcPath = join(ctxPath, zstdWarcName);
  const subproc = Bun.spawn({
    cmd: [
      "wget",
      "--no-verbose",
      "--tries=3",
      "--delete-after",
      "--input-file",
      listPath,
      `--warc-file=temp`,
    ],
    stderr: "ignore",
    stdout: "ignore",
    cwd: ctxPath,
  });
  const t0 = performance.now();
  await subproc.exited;
  inform(`wget para ${zstdWarcName} tardó ${formatMs(performance.now() - t0)}`);

  const gzippedWarcPath = join(ctxPath, "temp.warc.gz");
  if (!(await exists(gzippedWarcPath))) {
    const err = report(`no encontré el ${gzippedWarcPath}`);
    throw err;
  }

  await compressionQueue.add(() => recompress(gzippedWarcPath, zstdWarcPath));
  if (!(await exists(zstdWarcPath))) {
    const err = report(`no encontré el ${zstdWarcPath}`);
    throw err;
  }

  scrapAndInform({ zstdWarcPath, zstdWarcName });

  try {
    await uploadToBucket({
      fileName: zstdWarcName,
      file: Bun.file(zstdWarcPath),
    });
  } catch (error) {
    inform(`Falló subir ${zstdWarcName} a S3; ${error}`);
    console.error(error);
  }
}

async function scrapAndInform({
  zstdWarcPath,
  zstdWarcName,
}: {
  zstdWarcPath: string;
  zstdWarcName: string;
}) {
  const res = await scrapQueue.add(async () => {
    const t0 = performance.now();
    const progress = await parseWarc(zstdWarcPath);
    return { took: performance.now() - t0, progress };
  });

  if (res) {
    const { took, progress } = res;
    inform(
      `Procesado ${zstdWarcName} (${progress.done} ok, ${
        progress.errors.length
      } errores) (tardó ${formatMs(took)})`
    );
  } else {
    inform(`Algo falló en ${zstdWarcName}`);
  }
}

/**
 * toma un archivo gzippeado y lo recomprime con zstd.
 * borra el archivo original.
 */
function recompress(inputPath: string, outputPath: string) {
  // XXX: por alguna razón no funciona en Bun 1.0.20
  // const decompressor = Bun.spawn({
  //   cmd: ["gzip", "-dc", inputPath],
  //   stderr: "inherit",
  // });
  // const compressor = Bun.spawn({
  //   cmd: ["zstd", "-T0", "-15", "--long", "-o", outputPath],
  //   stdin: decompressor.stdout,
  //   // stderr: "inherit",
  // });
  // const errorCode = await compressor.exited;
  // if (errorCode !== 0) {
  //   const err = report(`zstd threw error code ${errorCode}`);
  //   throw err;
  // }

  return new Promise((resolve, reject) => {
    const decompressor = spawn("gzip", ["-dc", inputPath], {
      stdio: [null, "pipe", null],
    });
    const compressor = spawn(
      "zstd",
      ["-T0", "-15", "--long", "-o", outputPath],
      {
        stdio: ["pipe", null, null],
      }
    );
    // @ts-expect-error a los types de bun no le gusta????
    decompressor.stdout.pipe(compressor.stdin);
    compressor.on("close", (code) => {
      if (code !== 0) {
        const err = report(`zstd threw error code ${code}`);
        reject(err);
      }
      resolve(void 0);
    });
  });
}

async function uploadToBucket({
  fileName,
  file,
}: {
  fileName: string;
  file: BunFile;
}) {
  const parallelUploads3 = new Upload({
    client: s3,
    params: {
      Bucket: S3_BUCKET_NAME,
      Key: fileName,
      Body: file,
    },
  });
  await parallelUploads3.done();
}

function inform(msg: string) {
  sendTelegramMsg(msg);
  console.info(msg);
}
function report(msg: string) {
  inform(msg);
  const error = new Error(msg);

  return error;
}

async function exists(path: string) {
  try {
    access(path);
    return true;
  } catch {
    return false;
  }
}

async function sendTelegramMsg(text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_BOT_CHAT_ID)
    return;
  const url = new URL(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`
  );
  url.searchParams.set("chat_id", process.env.TELEGRAM_BOT_CHAT_ID);
  url.searchParams.set("text", text);
  await fetch(url);
}

function formatMs(ms: number) {
  return formatDuration(intervalToDuration({ start: 0, end: Math.round(ms) }));
}
