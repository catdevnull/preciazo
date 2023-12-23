/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference types="node" />
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { precios } from "db-datos/schema.js";
import { WARCParser } from "warcio";
import { createReadStream, createWriteStream } from "fs";
import { writeFile } from "fs/promises";
import { createHash } from "crypto";
import { getCarrefourProduct } from "./carrefour.js";
import { getDiaProduct } from "./dia.js";
import { getCotoProduct } from "./coto.js";
import { join } from "path";
import pMap from "p-map";

const DEBUG = false;

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

sqlite.run(`
pragma journal_mode = WAL;
PRAGMA synchronous = NORMAL;
`);
sqlite.run(`
create table if not exists precios(
  id integer primary key autoincrement,
  ean text not null,
  fetched_at text not null,
  precio_centavos integer,
  in_stock integer,
  url text
);
`);

let progress = { done: 0, errors: 0 };
await pMap(process.argv.slice(2), (path) => parseWarc(path), {
  concurrency: 40,
});

export type Precio = typeof precios.$inferInsert;
export type Precioish = Omit<Precio, "fetchedAt" | "url" | "id">;

async function storePrecioPoint(point: Precio) {
  await db.insert(precios).values(point);
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
