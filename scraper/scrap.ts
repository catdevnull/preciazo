import * as schema from "db-datos/schema.js";
import { writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { getCarrefourProduct } from "./parsers/carrefour.js";
import { getDiaProduct } from "./parsers/dia.js";
import { getCotoProduct } from "./parsers/coto.js";
import { join } from "path";
import { db } from "db-datos/db.js";
import pMap from "p-map";
import { getJumboProduct } from "./parsers/jumbo.js";

const DEBUG = true;
const PARSER_VERSION = 4;

export type Precio = typeof schema.precios.$inferInsert;
export type Precioish = Omit<
  Precio,
  "fetchedAt" | "url" | "id" | "warcRecordId" | "parserVersion"
>;

export async function downloadList(path: string) {
  let list = (await Bun.file(path).text())
    .split("\n")
    .filter((s) => s.length > 0);

  const results = await pMap(
    list,
    async (urlS) => {
      let res: ScrapResult = { type: "skipped" };
      for (let attempts = 0; attempts < 6; attempts++) {
        if (attempts !== 0) await wait(1500);
        res = await scrap(urlS);
        if (res.type === "done" || res.type === "skipped") {
          break;
        }
      }
      if (res.type === "error") console.error(res);
      return res;
    },
    { concurrency: 32 }
  );

  let progress: {
    done: number;
    skipped: number;
    errors: { error: any; url: string; debugPath: string }[];
  } = { done: 0, skipped: 0, errors: [] };
  for (const result of results) {
    switch (result.type) {
      case "done":
        progress.done++;
        break;
      case "error":
        progress.errors.push(result);
        break;
      case "skipped":
        progress.skipped++;
        break;
    }
  }
  return progress;
}

export async function getProduct(url: URL, html: string): Promise<Precioish> {
  if (url.hostname === "www.carrefour.com.ar") return getCarrefourProduct(html);
  else if (url.hostname === "diaonline.supermercadosdia.com.ar")
    return getDiaProduct(html);
  else if (url.hostname === "www.cotodigital3.com.ar")
    return getCotoProduct(html);
  else if (url.hostname === "www.jumbo.com.ar")
    return await getJumboProduct(html);
  else throw new Error(`Unknown host ${url.hostname}`);
}

type ScrapResult =
  | { type: "skipped" }
  | { type: "done" }
  | { type: "error"; url: string; error: any; debugPath: string };
async function scrap(urlS: string): Promise<ScrapResult> {
  let url;
  try {
    url = new URL(urlS);
  } catch (err) {
    console.error(`skipped ${urlS} because ${err}`);
    return { type: "skipped" };
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.debug(`skipped ${urlS} because status=${res.status} (!=200)`);
    return { type: "skipped" };
  }

  const html = await res.text();

  try {
    let ish = await getProduct(url, html);

    const p: Precio = {
      ...ish,
      fetchedAt: new Date(),
      url: urlS,
      parserVersion: PARSER_VERSION,
    };

    await db.insert(schema.precios).values(p);

    return { type: "done" };
  } catch (error) {
    const urlHash = createHash("md5").update(urlS).digest("hex");
    const output = join("debug", `${urlHash}.html`);
    if (DEBUG) {
      await mkdir("debug", { recursive: true });
      await writeFile(output, html);
    }
    return {
      type: "error",
      url: urlS,
      error,
      debugPath: output,
    };
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
