import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
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

	const query = params.query
		.replaceAll(/á/giu, 'a')
		.replaceAll(/é/giu, 'e')
		.replaceAll(/í/giu, 'i')
		.replaceAll(/ó/giu, 'o')
		.replaceAll(/ú/giu, 'u')
		.replaceAll(/ñ/giu, 'n');
	const productos = await db.execute<{
		id_producto: string;
		productos_descripcion: string;
		productos_marca: string | null;
		in_datasets_count: number;
	}>(sql`
		SELECT id_producto, productos_descripcion, productos_marca,
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
WHERE p.id_producto = index.id_producto) as in_datasets_count
		FROM productos_descripcion_index index
		WHERE productos_descripcion ILIKE ${`%${query}%`}
		ORDER BY in_datasets_count desc
		LIMIT 100
	`);
	const collapsedProductos = productos.reduce(
		(acc, producto) => {
			const existingProduct = acc.find((p) => p.id_producto === producto.id_producto);
			if (existingProduct) {
				existingProduct.descriptions.push(producto.productos_descripcion);
				if (producto.productos_marca) existingProduct.marcas.add(producto.productos_marca);
				existingProduct.in_datasets_count = Math.max(
					existingProduct.in_datasets_count,
					producto.in_datasets_count
				);
			} else {
				acc.push({
					id_producto: producto.id_producto,
					descriptions: [producto.productos_descripcion],
					marcas: new Set(producto.productos_marca ? [producto.productos_marca] : []),
					in_datasets_count: producto.in_datasets_count
				});
			}
			return acc;
		},
		[] as Array<{
			id_producto: string;
			descriptions: string[];
			marcas: Set<string>;
			in_datasets_count: number;
		}>
	);

	setHeaders({
		'Cache-Control': 'public, max-age=600'
	});

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
	return { productos, collapsedProductos, query };
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
