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
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getCarrefourProduct } from "./carrefour.js";
import { getDiaProduct } from "./dia.js";
import { getCotoProduct } from "./coto.js";
import { join } from "path";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

const DEBUG = true;

export type Precio = typeof precios.$inferInsert;
export type Precioish = Omit<Precio, "fetchedAt" | "url" | "id">;

async function storePrecioPoint(point: Precio) {
  await db.insert(precios).values(point);
}

(async () => {
  const o = createWriteStream("x.tsv");
  o.write(`ean\tfetchedAt\tprecioCentavos\tinStock\turl\n`);

  const warc = createReadStream(process.argv[2]);
  const parser = new WARCParser(warc);
  let progress = { done: 0, errors: 0 };
  for await (const record of parser) {
    if (record.warcType === "response") {
      if (!record.warcTargetURI) throw new Error("no uri");
      console.log(record.warcTargetURI);
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

        if (ish)
          o.write(
            `${p.ean}\t${p.fetchedAt}\t${p.precioCentavos}\t${p.inStock}\t${p.url}\n`
          );

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
        console.debug(progress);
      }
    }
  }
})();
