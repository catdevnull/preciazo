import { error } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get("q");
  let results: null | { ean: string; name: string; imageUrl: string }[] = null;
  if (query) {
    const sqlQuery = sql`select p.ean, p.name, p.image_url as imageUrl from precios_fts f
      join precios p on p.ean = f.ean
      where f.name match ${`"${query}"`}
      group by p.ean;`;
    results = db.all(sqlQuery);
  }

  return { query, results };
};
