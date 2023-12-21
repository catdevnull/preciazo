import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const precios = sqliteTable("precios", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
  precioCentavos: integer("precio_centavos").notNull(),
  ean: text("ean").notNull(),
  url: text("url"),
});
