import { count, countDistinct, eq, max, sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db, schema } from "$lib/server/db";
const { precios } = schema;

export const load: PageServerLoad = async () => {
  const nProductosR = await db
    .select({
      count: countDistinct(precios.ean),
    })
    .from(precios);
  const nProductos = nProductosR[0].count;
  return { nProductos };
};
