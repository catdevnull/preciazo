import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db, schema } from "$lib/server/db";

export const load: PageServerLoad = async ({ params }) => {
  const precios = await db.query.precios.findMany({
    where: eq(schema.precios.ean, params.ean),
  });
  if (precios.length === 0) return error(404, "Not Found");

  return { precios };
};
