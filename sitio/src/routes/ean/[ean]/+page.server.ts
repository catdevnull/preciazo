import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
const { precios } = schema;

export const load: PageServerLoad = async ({ params }) => {
  const db = await getDb();
  const q = db
    .select()
    .from(precios)
    .where(eq(precios.ean, params.ean))
    .orderBy(precios.fetchedAt);
  const res = await q;
  if (res.length === 0) return error(404, "Not Found");

  const meta = res.findLast((p) => p.name);

  return { precios: res, meta };
};
