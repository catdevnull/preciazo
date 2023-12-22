/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference types="node" />
import { parseHTML } from "linkedom";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { precios } from "./db/schema.js";
import { WARCParser } from "warcio";
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";
import { createHash } from "crypto";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

type Precio = typeof precios.$inferInsert;

async function storePrecioPoint(point: Precio) {
  await db.insert(precios).values(point);
}

function getEanByTable(dom: Window): string {
  const eanLabelEl = dom.window.document.querySelector(
    'td[data-specification="EAN"]'
  );
  const eanValueEl = eanLabelEl?.parentElement?.children[1];
  if (
    !eanValueEl ||
    !(eanValueEl instanceof dom.window.HTMLElement) ||
    !eanValueEl.dataset.specification
  )
    throw new Error("No encontré el EAN");
  return eanValueEl.dataset.specification;
}

function parseJsonLds(dom: Window): object[] {
  const scripts = dom.window.document.querySelectorAll(
    'script[type="application/ld+json"]'
  );
  return [...scripts].map((scripts) => JSON.parse(scripts.innerHTML));
}
function findJsonLd(dom: Window, type: string): object | undefined {
  return parseJsonLds(dom).find((x) => "@type" in x && x["@type"] === type);
}

function parseScriptJson<T>(dom: Window, varname: string): T {
  const script = dom.window.document.querySelector<HTMLTemplateElement>(
    `template[data-type="json"][data-varname="${varname}"]`
  )?.content?.children[0];
  if (!script) throw new Error("no encuentro el script");
  return JSON.parse(script.innerHTML);
}

function eanFromSeedState(dom: Window): string {
  const json = parseScriptJson<object>(dom, "__STATE__");
  const productJson = Object.entries(json).find(
    ([key, val]) => key.startsWith("Product:") && val.__typename === "Product"
  );
  if (!productJson) throw new Error("no encontré el product en el json");

  const productSkuJson = Object.entries(json).find(
    ([key, val]) =>
      key.startsWith(`Product:${productJson[1].cacheId}`) &&
      val.__typename === "SKU"
  );
  if (!productSkuJson) throw new Error("no encontré el sku en el json");
  return productSkuJson[1].ean;
}

function eanFromDynamicYieldScript(dom: Window): string {
  const scriptEl = dom.window.document.querySelector(
    `script[src^="//st.dynamicyield.com/st?"]`
  );
  if (!scriptEl || !(scriptEl instanceof dom.window.HTMLScriptElement))
    throw new Error("no encuentro el script de dynamicyield");

  const url = new URL(scriptEl.src);
  const ctx = url.searchParams.get("ctx");
  if (!ctx) throw new Error("no hay ctx");
  return JSON.parse(ctx).data[0];
}

function getCarrefourProduct(html: string | Buffer): Precio {
  const dom = parseHTML(html);

  const precioMeta = dom.window.document
    .querySelector(`meta[property="product:price:amount"]`)
    ?.getAttribute("content");
  if (!precioMeta) throw new Error("No encontré el precio");
  const precioCentavos = parseFloat(precioMeta) * 100;

  // const productLd = findJsonLd(dom, "Product");
  const ean = eanFromSeedState(dom);

  return {
    ean,
    precioCentavos,
    fetchedAt: new Date(),
  };
}

(async () => {
  // await migrate(db, { migrationsFolder: "./drizzle" });
  // const p = await getCarrefourProduct(
  //   "https://www.carrefour.com.ar/bebida-lactea-la-serenisima-ultra-0-grasa-vainilla-900-cc/p"
  // );
  // await storePrecioPoint(p);

  const warc = createReadStream(process.argv[2]);
  const parser = new WARCParser(warc);
  for await (const record of parser) {
    if (record.warcType === "response") {
      console.log(record.warcTargetURI);
      const html = await record.contentText();
      try {
        const product = getCarrefourProduct(html);
        console.log(product);
      } catch (error) {
        console.error(error);
        const urlHash = createHash("md5")
          .update(record.warcTargetURI!)
          .digest("hex");
        const output = `${urlHash}.html`;
        await writeFile(output, html);
        console.error(`wrote html to ${output}`);
      }
    }
  }
})();
