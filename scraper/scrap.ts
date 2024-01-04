import * as schema from "db-datos/schema.js";
import { writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { getCarrefourProduct } from "./parsers/carrefour.js";
import { getDiaProduct } from "./parsers/dia.js";
import { getCotoProduct } from "./parsers/coto.js";
import { join } from "path";
import { db } from "db-datos/db.js";
import pMap from "p-map";

const DEBUG = true;
const PARSER_VERSION = 4;

export type Precio = typeof schema.precios.$inferInsert;
export type Precioish = Omit<
  Precio,
  "fetchedAt" | "url" | "id" | "warcRecordId" | "parserVersion"
>;

export async function downloadList(path: string) {
  let progress: {
    done: number;
    skipped: number;
    errors: { error: any; url: string; path: string }[];
  } = { done: 0, skipped: 0, errors: [] };

  let list = (await Bun.file(path).text())
    .split("\n")
    .filter((s) => s.length > 0);

  await pMap(
    list,
    async (urlS) => {
      let url;
      try {
        url = new URL(urlS);
      } catch (err) {
        console.error("error parseando", urlS);
        return;
      }
      const res = await fetch(url);
      if (!res.ok) {
        console.debug(`skipped ${urlS} because status=${res.status} (!=200)`);
        progress.skipped++;
        return;
      }

      const html = await res.text();

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
          fetchedAt: new Date(),
          url: urlS,
          parserVersion: PARSER_VERSION,
        };

        await db.insert(schema.precios).values(p);

        progress.done++;
      } catch (error) {
        console.error({ path, urlS, error });
        progress.errors.push({
          path,
          url: urlS,
          error,
        });

        if (DEBUG) {
          const urlHash = createHash("md5").update(urlS).digest("hex");
          const output = join("debug", `${urlHash}.html`);
          await mkdir("debug", { recursive: true });
          await writeFile(output, html);
          console.error(`wrote html to ${output}`);
        }
      }
    },
    { concurrency: 32 }
  );

  return progress;
}
