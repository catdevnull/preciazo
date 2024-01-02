import type { PageServerLoad } from "./$types";
import { db, schema } from "$lib/server/db";
const { precios } = schema;
import { sql } from "drizzle-orm";

export const load: PageServerLoad = async ({ params }) => {
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
  return { precios: res };
};
