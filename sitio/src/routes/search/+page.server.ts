import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { getDb } from "$lib/server/db";

export const load: PageServerLoad = async ({ url }) => {
  const db = await getDb();
  const query = url.searchParams.get("q");
  let results: null | { ean: string; name: string; imageUrl: string }[] = null;
  if (query) {
    const sQuery = query
      .replaceAll(`"`, `""`)
      .split(" ")
      .map((s) => `"${s}"`)
      .join(" ");
    console.debug(sQuery);
    const sqlQuery = sql`select p.ean, p.name, p.image_url as imageUrl from precios_fts f
      join precios p on p.ean = f.ean
      where f.name match ${sQuery}
      group by p.ean
      having max(p.fetched_at)
      order by p.in_stock desc;`;
    results = db.all(sqlQuery);
  }

  return { query, results };
};
