import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {

	// const latestDatasetsSq =  db.$with('latest_datasets').as(
	// 	db.select({
	// 		id: datasets.id,
	// 	}).from(datasets)
	// 	.innerJoin(
	// 		db.select({
	// 			id_comercio: datasets.id_comercio,
	// 			max_date: max(datasets.date),
	// 		}).from(d2).groupBy(datasets.id_comercio),
	// 		and(eq(datasets.id_comercio, d2.id_comercio), eq(datasets.date, d2.max_date))
	// 		// 'datasets.id_comercio = latest_datasets.id_comercio AND datasets.date = latest_datasets.max_date'
	// 	))

	const query = params.query;
	const productos = await db.execute(sql`
		SELECT id_producto, productos_descripcion, productos_marca
		FROM productos_descripcion_index index
		WHERE productos_descripcion ILIKE ${`%${query}%`}
		ORDER BY 
(WITH latest_datasets AS (
  SELECT d1.id
  FROM datasets d1
  JOIN (
    SELECT id_comercio, MAX(date) as max_date
    FROM datasets
    GROUP BY id_comercio
  ) d2 ON d1.id_comercio = d2.id_comercio AND d1.date = d2.max_date
)SELECT COUNT(DISTINCT p.id_dataset) as dataset_count
FROM precios p
JOIN latest_datasets ld ON p.id_dataset = ld.id
WHERE p.id_producto = index.id_producto) desc
	`)
// 		'latest_datasets',
// 		sql`
// WITH latest_datasets AS (
//   SELECT d1.id
//   FROM datasets d1
//   JOIN (
//     SELECT id_comercio, MAX(date) as max_date
//     FROM datasets
//     GROUP BY id_comercio
//   ) d2 ON d1.id_comercio = d2.id_comercio AND d1.date = d2.max_date
// )`
// 		.select({
// 			id_producto: productos_descripcion_index.id_producto,
// 			productos_descripcion: productos_descripcion_index.productos_descripcion,
// 			productos_marca: productos_descripcion_index.productos_marca,
// 		})
// 		.from(productos_descripcion_index)
// 		.where(ilike(productos_descripcion_index.productos_descripcion, `%${query}%`))
// 		.orderBy(sql`
// WITH latest_datasets AS (
//   SELECT d1.id
//   FROM datasets d1
//   JOIN (
//     SELECT id_comercio, MAX(date) as max_date
//     FROM datasets
//     GROUP BY id_comercio
//   ) d2 ON d1.id_comercio = d2.id_comercio AND d1.date = d2.max_date
// )
// SELECT COUNT(DISTINCT p.id_dataset) as dataset_count
// FROM precios p
// JOIN latest_datasets ld ON p.id_dataset = ld.id
// WHERE p.id_producto = ${productos_descripcion_index.id_producto}`);
	return { productos };
	// 	const precios = await sql<
	// 		{
	// 			id_producto: string;
	// 			productos_precio_lista: number;
	// 			productos_descripcion: string;
	// 		}[]
	// 	>`
	//     WITH latest_prices AS (
	//         SELECT DISTINCT ON (id_comercio, id_producto)
	//             id_comercio,
	//             id_producto,
	//             productos_precio_lista,
	//             productos_descripcion
	//         FROM precios
	//     )
	//     SELECT
	//         id_producto,
	//         productos_precio_lista,
	//         productos_descripcion
	//     FROM latest_prices
	//     WHERE productos_descripcion ILIKE ${`%${query}%`}
	//   `;

	// 	return {
	// 		precios
	// 	};
};
