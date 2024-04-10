import type { PageServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
const { precios, bestSelling } = schema;
import { max, sql } from "drizzle-orm";
import z from "zod";
import type { Product } from "$lib/ProductPreview.svelte";

type Data = {
  category: string;
  products: Product[];
}[];

let cache: Promise<{ key: Date; data: Data }> = doQuery();

async function doQuery() {
  const db = await getDb();

  const categories = await db
    .select({
      fetchedAt: bestSelling.fetchedAt,
      category: bestSelling.category,
      eansJson: bestSelling.eansJson,
    })
    .from(bestSelling)
    .groupBy(bestSelling.category)
    .having(max(bestSelling.fetchedAt));

  const categoriesWithProducts = await Promise.all(
    categories.map(async (category) => {
      const eans = z.array(z.string()).parse(JSON.parse(category.eansJson));

      const products = await db
        .select({
          ean: precios.ean,
          name: precios.name,
          imageUrl: precios.imageUrl,
        })
        .from(precios)
        .where(sql`${precios.ean} in ${eans}`)
        .groupBy(precios.ean)
        .having(max(precios.fetchedAt));

      return {
        category: category.category,
        products: eans
          .map((ean) => products.find((p) => p.ean === ean))
          .filter((x): x is Product => !!x && !!x.name),
      };
    }),
  );

  return { key: new Date(), data: categoriesWithProducts };
}

console.log("setting up interval");
setInterval(
  async () => {
    const c = await doQuery();
    cache = Promise.resolve(c);
  },
  4 * 60 * 60 * 1000,
);

export const load: PageServerLoad = async ({
  params,
}): Promise<{ data: Data }> => {
  return { data: (await cache).data };
};
