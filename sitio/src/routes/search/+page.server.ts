import { error } from "@sveltejs/kit";
import { eq, max, sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db, schema } from "$lib/server/db";
const { precios } = schema;

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get("q");
  let results: null | { ean: string; name: string }[] = null;
  if (query) {
    results = db.all(
      sql`select ean, name from precios_fts where name match ${query};`,
    );
  }

  return { query, results };
};
