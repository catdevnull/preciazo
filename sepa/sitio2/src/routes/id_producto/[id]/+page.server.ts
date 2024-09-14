import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';
import { datasets, precios, sucursales } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
export const load: PageServerLoad = async ({ params }) => {
	const id = BigInt(params.id);
	const preciosRes = await db
		.select({
			id_comercio: precios.id_comercio,
			id_bandera: precios.id_bandera,
			id_sucursal: precios.id_sucursal,
			id_dataset: precios.id_dataset,
			productos_precio_lista: precios.productos_precio_lista,
			productos_descripcion: precios.productos_descripcion,
			sucursales_latitud: sucursales.sucursales_latitud,
			sucursales_longitud: sucursales.sucursales_longitud,
			sucursales_nombre: sucursales.sucursales_nombre,
			sucursales_calle: sucursales.sucursales_calle,
			sucursales_numero: sucursales.sucursales_numero,
			dataset_date: datasets.date
		})
		.from(precios)
		.where(
			and(
				eq(precios.id_producto, BigInt(params.id)),
				sql`${precios.id_dataset} IN (


					SELECT d1.id
FROM datasets d1
JOIN (
    SELECT id_comercio, MAX(date) as max_date
    FROM datasets
    GROUP BY id_comercio
) d2 ON d1.id_comercio = d2.id_comercio AND d1.date = d2.max_date
ORDER BY d1.id_comercio)
				`
			)
		)
		.leftJoin(
			sucursales,
			and(
				eq(sucursales.id_dataset, precios.id_dataset),
				eq(sucursales.id_sucursal, precios.id_sucursal),
				eq(sucursales.id_comercio, precios.id_comercio)
			)
		)
		.leftJoin(datasets, eq(datasets.id, precios.id_dataset));

	// 	const precios = await sql<
	// 		{
	// 			productos_precio_lista: number;
	// 			productos_descripcion: string;
	// 			id_dataset: string;
	// 			sucursales_latitud: number;
	// 			sucursales_longitud: number;
	// 			sucursales_nombre: string;
	// 		}[]
	// 	>`
	// 	WITH latest_prices AS (
	//       SELECT
	//           p.id_comercio,
	//           p.id_bandera,
	//           p.id_sucursal,
	//           p.id_dataset,
	//           p.productos_precio_lista,
	//           p.productos_descripcion
	//       FROM precios p
	//       INNER JOIN (
	//           SELECT
	//               id_comercio,
	//               id_bandera,
	//               id_sucursal,
	//               MAX(id_dataset) AS max_dataset
	//           FROM precios
	//           WHERE id_producto = ${id}
	//           GROUP BY id_comercio, id_bandera, id_sucursal
	//       ) latest ON p.id_comercio = latest.id_comercio
	//                AND p.id_bandera = latest.id_bandera
	//                AND p.id_sucursal = latest.id_sucursal
	//                AND p.id_dataset = latest.max_dataset
	//       WHERE p.id_producto = ${id}
	//   )
	//   SELECT
	//       lp.productos_precio_lista,
	//       lp.productos_descripcion,
	//       lp.id_dataset,
	//       s.sucursales_latitud,
	//       s.sucursales_longitud,
	//       s.sucursales_nombre
	//   FROM latest_prices lp
	//   LEFT JOIN sucursales s ON lp.id_dataset = s.id_dataset
	//                         AND lp.id_sucursal = s.id_sucursal
	//                         AND lp.id_comercio = s.id_comercio

	//   `;

	return {
		precios: preciosRes.map((p) => ({
			...p,
			productos_precio_lista: parseFloat(p.productos_precio_lista ?? '0'),
			sucursales_latitud: parseFloat(p.sucursales_latitud ?? '0'),
			sucursales_longitud: parseFloat(p.sucursales_longitud ?? '0')
		})),
		id_producto: id
	};
};
