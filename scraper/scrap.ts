/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "db-datos/schema.js";
import { WARCParser } from "warcio";
import { writeFile } from "fs/promises";
import { createHash } from "crypto";
import { getCarrefourProduct } from "./carrefour.js";
import { getDiaProduct } from "./dia.js";
import { getCotoProduct } from "./coto.js";
import { join } from "path";
import pMap from "p-map";
import { and, eq, sql } from "drizzle-orm";

const DEBUG = false;
const PARSER_VERSION = 1;

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite, { schema });

sqlite.run(`
pragma journal_mode = WAL;
PRAGMA synchronous = NORMAL;
`);
const getPrevPrecio = db
  .select({ id: schema.precios.id })
  .from(schema.precios)
  .where(
    and(
      eq(schema.precios.warcRecordId, sql.placeholder("warcRecordId")),
      eq(schema.precios.parserVersion, PARSER_VERSION)
    )
  )
  .limit(1)
  .prepare();

let progress = { done: 0, errors: 0 };
await pMap(process.argv.slice(2), (path) => parseWarc(path), {
  concurrency: 40,
});

export type Precio = typeof schema.precios.$inferInsert;
export type Precioish = Omit<
  Precio,
  "fetchedAt" | "url" | "id" | "warcRecordId" | "parserVersion"
>;

async function storePrecioPoint(point: Precio) {
  await db.insert(schema.precios).values(point);
}

async function parseWarc(path: string) {
  // const warc = createReadStream(path);

  const warc = Bun.spawn(["zstd", "-do", "/dev/stdout", path], {
    stderr: "ignore",
  }).stdout;

  const parser = new WARCParser(warc);
  for await (const record of parser) {
    if (record.warcType === "response") {
      if (!record.warcTargetURI) continue;
      const warcRecordId = record.warcHeader("WARC-Record-ID");
      if (!warcRecordId) throw new Error("No tiene WARC-Record-ID");

      if (getPrevPrecio.get({ warcRecordId })) {
        console.debug(`skipped ${warcRecordId}`);
        continue;
      }
      // TODO: sobreescribir si existe el mismo record-id pero con version mas bajo?

      const html = await record.contentText();

      const url = new URL(record.warcTargetURI);
      try {
        let ish: Precioish | undefined = undefined;
        if (url.hostname === "www.carrefour.com.ar")
          ish = getCarrefourProduct(html);
        else if (url.hostname === "diaonline.supermercadosdia.com.ar")
          ish = getDiaProduct(html);
        else if (url.hostname === "www.cotodigital3.com.ar")
          ish = getCotoProduct(html);
        else throw new Error(`Unknown host ${url.hostname}`);

        const p: Precio = {
          ...ish,
          fetchedAt: new Date(record.warcDate!),
          url: record.warcTargetURI,
          warcRecordId,
          parserVersion: PARSER_VERSION,
        };

        if (ish) await storePrecioPoint(p);

        // console.log(product);
        progress.done++;
      } catch (error) {
        console.error(error);
        progress.errors++;

        if (DEBUG) {
          const urlHash = createHash("md5")
            .update(record.warcTargetURI!)
            .digest("hex");
          const output = join("debug", `${urlHash}.html`);
          await writeFile(output, html);
          console.error(`wrote html to ${output}`);
        }
      } finally {
        console.debug(`done: ${progress.done}; errored: ${progress.errors}`);
      }
    }
  }
}
