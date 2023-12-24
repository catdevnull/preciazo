import { error } from "@sveltejs/kit";
import { eq, max } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db, schema } from "$lib/server/db";
const { precios } = schema;

export const load: PageServerLoad = async ({ params }) => {
  const q = db
    .select()
    .from(precios)
    .where(eq(precios.ean, params.ean))
    .groupBy(precios.warcRecordId)
    .having(max(precios.parserVersion));
  const res = await q;
  if (res.length === 0) return error(404, "Not Found");

  const meta = res.find((p) => p.name);

  return { precios: res, meta };
};
