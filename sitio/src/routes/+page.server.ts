import type { PageData, PageServerLoad } from "./$types";
import { db, schema } from "$lib/server/db";
const { precios } = schema;
import { sql } from "drizzle-orm";

let cache: null | { key: Date; data: PageData } = null;

export const load: PageServerLoad = async ({ params }) => {
  if (cache && +new Date() < +cache.key + 1000 * 60 * 10) {
    return cache.data;
  }
  const q = db
    .select({
      ean: precios.ean,
      name: precios.name,
      imageUrl: precios.imageUrl,
    })
    .from(precios)
    .groupBy(precios.ean)
    .having(sql`max(length(name)) and max(parser_version) and in_stock`)
    .orderBy(sql`random()`)
    .limit(150);
  const res = await q;
  const data = { precios: res };
  cache = { key: new Date(), data };
  return data;
};
