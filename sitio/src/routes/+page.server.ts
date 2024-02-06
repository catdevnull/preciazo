import type { PageData, PageServerLoad } from "./$types";
import { getDb, schema } from "$lib/server/db";
const { precios } = schema;
import { desc, sql } from "drizzle-orm";
import {
  Supermercado,
  hostBySupermercado,
  supermercados,
} from "db-datos/supermercado";

let cache: Promise<{ key: Date; data: { precios: Precios } }> = doQuery();


async function doQuery() {
  const db = await getDb();
  console.time("ean");
  const eans = await db
    .select({
      ean: precios.ean,
    })
    .from(precios)
    .groupBy(precios.ean)
    .orderBy(sql`random()`)
    .limit(50);
  console.timeEnd("ean");

  return;

  const precioss = await Promise.all(
    supermercados.map(
      async (
        supermercado,
      ): Promise<
        [
          Supermercado,
          { ean: string; name: string | null; imageUrl: string | null }[],
        ]
      > => {
        const host = hostBySupermercado[supermercado];
        console.time(supermercado);
        const q = db
          .select({
            ean: precios.ean,
            name: precios.name,
            imageUrl: precios.imageUrl,
          })
          .from(precios)
          .groupBy(precios.ean)
          .having(sql`max(fetched_at)`)
          .where(
            sql`ean in ${eans.map((x) => x.ean)} and in_stock and url like ${`%${host}%`}`,
          );
        // console.debug(q.toSQL());
        const res = await q;
        console.timeEnd(supermercado);
        return [supermercado, res];
      },
    ),
  );
  const data = { precios: precioss.flatMap(([_, r]) => r) };
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
