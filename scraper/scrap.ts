import { JSDOM } from "jsdom";
import { getHtml } from "./fetch.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { precios } from "./db/schema.js";
import { open } from "fs/promises";
import { WARCParser } from "warcio";
import { createReadStream } from "fs";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

type Precio = typeof precios.$inferInsert;

async function storePrecioPoint(point: Precio) {
  await db.insert(precios).values(point);
}

function getCarrefourProduct(html: string | Buffer): Precio {
  const dom = new JSDOM(html);

  const listPriceValueEl = dom.window.document.querySelector(
    ".valtech-carrefourar-product-price-0-x-listPriceValue"
  );
  const matches = listPriceValueEl?.textContent?.match(/([\d,]+)/);
  if (!matches || !matches[1]) throw new Error("No encontré el precio");
  const precio = parseFloat(matches[1].replace(",", "."));

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
  const ean = eanValueEl.dataset.specification;

  return {
    ean,
    precioCentavos: precio * 100,
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
      const product = getCarrefourProduct(html);
      console.log(product);
    }
  }
})();
