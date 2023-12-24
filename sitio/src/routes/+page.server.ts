import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db, schema } from "$lib/server/db";
import { ilike, like, sql } from "drizzle-orm";

export const load: PageServerLoad = async ({ params }) => {
  const q = db
    .select({ ean: schema.precios.ean })
    .from(schema.precios)
    .where(
      like(schema.precios.url, `https://diaonline.supermercadosdia.com.ar%`),
    )
    .groupBy(schema.precios.ean)
    .orderBy(sql`random()`)
    .limit(150);
  const precios = await q;
  return { precios };
};
