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

const supermercados: Supermercado[] = [
  Supermercado.Carrefour,
  Supermercado.Coto,
  Supermercado.Dia,
];

// hacemos una cola para la compresión para no sobrecargar la CPU
const compressionQueue = new PQueue({ concurrency: 1 });

// hacemos una cola para el scrapeo para no tener varios writers a la BD y no sobrecargar la CPU
const scrapQueue = new PQueue({ concurrency: 1 });

export async function auto() {
  const a = new Auto();
  await Promise.all(supermercados.map((supr) => a.downloadList(supr)));
}

class Auto {
  s3Config?: { s3: S3Client; bucketName: string };
  telegramConfig?: { token: string; chatId: string };

  constructor() {
    if (
      !process.env.S3_ACCESS_KEY_ID ||
      !process.env.S3_SECRET_ACCESS_KEY ||
      !process.env.S3_BUCKET_NAME
    ) {
      if (process.env.NODE_ENV === "development") {
        console.warn("faltan creds de s3, no voy a subir a s3");
      } else {
        throw new Error("faltan creds de s3");
      }
    } else {
      this.s3Config = {
        // https://www.backblaze.com/docs/cloud-storage-use-the-aws-sdk-for-javascript-v3-with-backblaze-b2
        s3: new S3Client({
          endpoint: "https://s3.us-west-004.backblazeb2.com",
          region: "us-west-004",
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          },
        }),
        bucketName: process.env.S3_BUCKET_NAME,
      };
    }

    if (!process.env.TELEGRAM_BOT_TOKEN)
      console.warn("no hay TELEGRAM_BOT_TOKEN, no voy a loggear por allá");
    else if (!process.env.TELEGRAM_BOT_CHAT_ID)
      console.warn("no hay TELEGRAM_BOT_CHAT_ID, no voy a loggear por allá");
    else
      this.telegramConfig = {
        token: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_BOT_CHAT_ID,
      };

    this.inform("[auto] Empezando scrap");
  }

  async downloadList(supermercado: Supermercado) {
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
    this.inform(
      `wget para ${zstdWarcName} tardó ${formatMs(performance.now() - t0)}`
    );

    const gzippedWarcPath = join(ctxPath, "temp.warc.gz");
    if (!(await fileExists(gzippedWarcPath))) {
      const err = this.report(`no encontré el ${gzippedWarcPath}`);
      throw err;
    }

    await compressionQueue.add(() =>
      this.recompress(gzippedWarcPath, zstdWarcPath)
    );
    if (!(await fileExists(zstdWarcPath))) {
      const err = this.report(`no encontré el ${zstdWarcPath}`);
      throw err;
    }

    this.scrapAndInform({ zstdWarcPath, zstdWarcName });

    try {
      await this.uploadToBucket({
        fileName: zstdWarcName,
        file: Bun.file(zstdWarcPath),
      });
    } catch (error) {
      this.inform(`Falló subir ${zstdWarcName} a S3; ${error}`);
      console.error(error);
    }

    // TODO: borrar archivos temporales
  }

  async scrapAndInform({
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
      this.inform(
        `Procesado ${zstdWarcName} (${progress.done} ok, ${
          progress.errors.length
        } errores) (tardó ${formatMs(took)})`
      );
    } else {
      this.inform(`Algo falló en ${zstdWarcName}`);
    }
  }

  /**
   * toma un archivo gzippeado y lo recomprime con zstd.
   * borra el archivo original.
   */
  recompress(inputPath: string, outputPath: string) {
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
          const err = this.report(`zstd threw error code ${code}`);
          reject(err);
        }
        resolve(void 0);
      });
    });
  }

  async uploadToBucket({
    fileName,
    file,
  }: {
    fileName: string;
    file: BunFile;
  }) {
    if (!this.s3Config) {
      this.inform(
        `[s3] Se intentó subir ${fileName} pero no tenemos creds de S3`
      );
      return;
    }
    const parallelUploads3 = new Upload({
      client: this.s3Config.s3,
      params: {
        Bucket: this.s3Config.bucketName,
        Key: fileName,
        Body: file,
      },
    });
    await parallelUploads3.done();
  }

  inform(msg: string) {
    this.sendTelegramMsg(msg);
    console.info(msg);
  }
  report(msg: string) {
    this.inform(msg);
    const error = new Error(msg);

    return error;
  }

  async sendTelegramMsg(text: string) {
    if (!this.telegramConfig) return;
    const url = new URL(
      `https://api.telegram.org/bot${this.telegramConfig.token}/sendMessage`
    );
    url.searchParams.set("chat_id", this.telegramConfig.chatId);
    url.searchParams.set("text", text);
    await fetch(url);
  }
}
// await recompress("sqlite.db.gz", "sqlite.db.zst");

// no se llama exists porque bun tiene un bug en el que usa fs.exists por mas que exista una funcion llamada exists
async function fileExists(path: string) {
  try {
    access(path);
    return true;
  } catch {
    return false;
  }
}

function formatMs(ms: number) {
  return formatDuration(intervalToDuration({ start: 0, end: Math.round(ms) }));
}
