import { countDistinct } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
const { precios } = schema;

export const load: PageServerLoad = async () => {
  const db = await getDb();
  const nProductosR = await db
    .select({
      count: countDistinct(precios.ean),
    })
    .from(precios);
  const nProductos = nProductosR[0].count;
  return { nProductos };
};
