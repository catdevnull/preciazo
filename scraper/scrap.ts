/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference types="node" />
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { precios } from "./db/schema.js";
import { WARCParser } from "warcio";
import { createReadStream, createWriteStream } from "fs";
import { writeFile } from "fs/promises";
import { createHash } from "crypto";
import { getCarrefourProduct } from "./carrefour.js";
import { getDiaProduct } from "./dia.js";
import { getCotoProduct } from "./coto.js";
import { join } from "path";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

sqlite.run(`
pragma journal_mode = WAL;
pragma synchronous = normal;
pragma temp_store = memory;
pragma mmap_size = 30000000000;
`);
sqlite.run(`
create table precios(
  id integer primary key autoincrement,
  ean text not null,
  fetched_at text not null,
  precio_centavos integer,
  in_stock integer,
  url text
);
`);

for (const path of process.argv.slice(2)) {
  await parseWarc(path);
}

const DEBUG = false;

export type Precio = typeof precios.$inferInsert;
export type Precioish = Omit<Precio, "fetchedAt" | "url" | "id">;

async function storePrecioPoint(point: Precio) {
  await db.insert(precios).values(point);
}

async function parseWarc(path: string) {
  const warc = createReadStream(path);
  const parser = new WARCParser(warc);
  let progress = { done: 0, errors: 0 };
  for await (const record of parser) {
    if (record.warcType === "response") {
      if (!record.warcTargetURI) throw new Error("no uri");
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
