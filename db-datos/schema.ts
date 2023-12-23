import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const precios = sqliteTable("precios", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  ean: text("ean").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
  precioCentavos: integer("precio_centavos"),
  inStock: integer("in_stock", { mode: "boolean" }),
  url: text("url").notNull(),
  warcRecordId: text("warc_record_id"),
  parserVersion: integer("parser_version"),
});

export type Precio = typeof precios.$inferSelect;
