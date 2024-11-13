/**
 * este script actualiza la base de datos "nueva" a partir de una base de datos
 * generada por el scraper "viejo" de preciazo, que scrapea los sitios de los supermercados.
 *
 * solo guarda los últimos metadatos de cada producto.
 *
 * se le pasa la base de datos SQLite del scraper como parametro.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { Database } from "bun:sqlite";

if (!process.argv[2]) {
  console.error("falta pasar la base de datos del scraper como parametro");
  process.exit(1);
}

const db = drizzle(postgres(), {
  schema,
  logger: true,
});
using scraperDb = new Database(process.argv[2], {
  strict: true,
  readonly: true,
});

const precios = scraperDb.query(`
  SELECT p.id, p.ean, p.name, p.image_url, p.url, p.precio_centavos, p.in_stock, p.fetched_at
  FROM precios p
  INNER JOIN (
      SELECT ean, MAX(fetched_at) as max_fetched_at
      FROM precios
      GROUP BY ean
  ) latest ON p.ean = latest.ean AND p.fetched_at = latest.max_fetched_at
  WHERE p.name IS NOT NULL
`);

// @ts-expect-error bun 1.1.30 has outdated types, it's fixed in main branch
for (const row of precios.iterate()) {
  console.log(row);
}
