// @ts-check
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const precios = sqliteTable(
  "precios",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    ean: text("ean").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
    precioCentavos: integer("precio_centavos"),
    inStock: integer("in_stock", { mode: "boolean" }),
    url: text("url").notNull(),
    warcRecordId: text("warc_record_id"),
    parserVersion: integer("parser_version"),
    name: text("name"),
    imageUrl: text("image_url"),
  },
  (precios) => {
    return {
      preciosEanIdx: index("precios_ean_idx").on(precios.ean),
      preciosUrlIdx: index("precios_url_idx").on(precios.url),
      preciosFetchedAtIdx: index("precios_fetched_at_idx").on(
        precios.fetchedAt
      ),
      preciosEanFetchedAtIdx: index("precios_ean_fetched_at_idx").on(
        precios.ean,
        precios.fetchedAt
      ),
    };
  }
);

/** @typedef {typeof precios.$inferSelect} Precio */

export const productoUrls = sqliteTable("producto_urls", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  url: text("url").unique().notNull(),
  firstSeen: integer("first_seen", { mode: "timestamp" }).notNull(),
  lastSeen: integer("last_seen", { mode: "timestamp" }).notNull(),
});

/** @typedef {typeof productoUrls.$inferSelect} ProductUrl */

export const bestSelling = sqliteTable("db_best_selling", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
  category: text("category").notNull(),
  eansJson: text("eans_json").notNull(),
});

/** @typedef {typeof bestSelling.$inferSelect} BestSelling */
