import type { PageData, PageServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
const { precios } = schema;
import { sql } from "drizzle-orm";

let cache: Promise<{ key: Date; data: { precios: Precios } }> = doQuery();

async function doQuery() {
  const db = await getDb();
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
  const data = { precios: res };
  return { key: new Date(), data };
}

setInterval(
  async () => {
    const c = await doQuery();
    cache = Promise.resolve(c);
  },
  4 * 60 * 60 * 1000,
);

type Precios = {
  ean: string;
  name: string | null;
  imageUrl: string | null;
}[];

export const load: PageServerLoad = async ({
  params,
}): Promise<{ precios: Precios }> => {
  return (await cache).data;
};
