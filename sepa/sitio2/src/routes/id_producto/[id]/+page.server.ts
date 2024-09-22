import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';
import { banderas, datasets, precios, sucursales } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { formatISO, subDays } from 'date-fns';
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const id = BigInt(params.id);
	const aWeekAgo = subDays(new Date(), 5);
	const preciosQuery = db
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
			dataset_date: datasets.date,
			comercio_cuit: banderas.comercio_cuit,
			comercio_razon_social: banderas.comercio_razon_social,
			comercio_bandera_nombre: banderas.comercio_bandera_nombre,
			comercio_bandera_url: banderas.comercio_bandera_url
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
	WHERE date > ${formatISO(aWeekAgo, { representation: 'date' })}
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
		.leftJoin(datasets, eq(datasets.id, precios.id_dataset))
		.leftJoin(
			banderas,
			and(
				eq(banderas.id_comercio, precios.id_comercio),
				eq(banderas.id_bandera, precios.id_bandera)
			)
		);
	const preciosRes = await Sentry.startSpan(
		{
			op: 'db.query',
			name: preciosQuery.toSQL().sql,
			data: { 'db.system': 'postgresql' }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
		() => preciosQuery
	);

	setHeaders({
		'Cache-Control': 'public, max-age=600'
	});

	if (preciosRes.length == 0) {
		return error(404, `Producto ${params.id} no encontrado`);
	}

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
