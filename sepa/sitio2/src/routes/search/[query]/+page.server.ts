import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { ilike, or, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as Sentry from '@sentry/sveltekit';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const query = params.query
		.replaceAll(/á/giu, 'a')
		.replaceAll(/é/giu, 'e')
		.replaceAll(/í/giu, 'i')
		.replaceAll(/ó/giu, 'o')
		.replaceAll(/ú/giu, 'u')
		.replaceAll(/ñ/giu, 'n');
	const productosQuery = db
		.select({
			id_producto: schema.productos_descripcion_index.id_producto,
			productos_descripcion: schema.productos_descripcion_index.productos_descripcion,
			productos_marca: schema.productos_descripcion_index.productos_marca,
			in_datasets_count: sql<number>`
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
WHERE p.id_producto = productos_descripcion_index.id_producto)`.as('in_datasets_count')
		})
		.from(schema.productos_descripcion_index)
		.where(
			or(
				sql`to_tsvector('spanish', ${schema.productos_descripcion_index.productos_descripcion}) @@ to_tsquery('spanish', ${query})`,
				ilike(schema.productos_descripcion_index.productos_marca, `%${query}%`)
			)
		)
		.orderBy(sql`in_datasets_count desc`)
		.limit(100);
	const productos = await Sentry.startSpan(
		{
			op: 'db.query',
			name: productosQuery.toSQL().sql,
			data: { 'db.system': 'postgresql' }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
		() => productosQuery
	);
	const collapsedProductos = productos.reduce(
		(acc, producto) => {
			const existingProduct = acc.find((p) => BigInt(p.id_producto) === producto.id_producto);
			if (existingProduct) {
				existingProduct.descriptions.push(producto.productos_descripcion!);
				if (producto.productos_marca) existingProduct.marcas.add(producto.productos_marca);
				existingProduct.in_datasets_count = Math.max(
					existingProduct.in_datasets_count,
					producto.in_datasets_count
				);
			} else {
				acc.push({
					id_producto: producto.id_producto!.toString(),
					descriptions: [producto.productos_descripcion!],
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

	return { productos, collapsedProductos, query };
};
