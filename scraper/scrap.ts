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
import pMap from "p-map";
import { parseWARC } from "./warc.js";

const DEBUG = true;

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

sqlite.run(`
pragma journal_mode = OFF;
pragma synchronous = 0;
pragma cache_size = 1000000;
pragma locking_mode = exclusive;
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

  const parser = parseWARC(path);
  for await (const record of parser) {
    if (record.fields.get("WARC-Type") === "response") {
      const rawUri = record.fields.get("WARC-Target-URI");
      if (!rawUri) continue;
      const html = record.content.toString();

      const url = new URL(rawUri.replace(/^</, "").replace(/>$/, ""));
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
          fetchedAt: new Date(record.fields.get("WARC-Date")!),
          url: url.toString(),
        };

        if (ish) await storePrecioPoint(p);

        // console.log(product);
        progress.done++;
      } catch (error) {
        console.error(error);
        progress.errors++;

        if (DEBUG) {
          const urlHash = createHash("md5")
            .update(url.toString())
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
