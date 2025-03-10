import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { DuckDBDecimalValue } from '@duckdb/node-api';
import { instance, DATA_PATH } from '$lib/duckdb';
import { dev } from '$app/environment';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const { success, data } = z.object({ id: z.coerce.bigint() }).safeParse(params);
	if (!success) {
		return error(400, `Esta URL es inválida`);
	}

	const conn = await instance.connect();

	const latestDate = '2025-01-01';

	console.time('getProduct');
	const reader = await conn.runAndReadAll(
		`
		with precios as (
			select * from read_parquet($1)
		), sucursales as (
			select * from read_parquet($2)
		), banderas as (
			select * from read_parquet($3)
		)
		select * from precios
		inner join sucursales on precios.id_sucursal = sucursales.id_sucursal and precios.id_comercio = sucursales.id_comercio and precios.id_bandera = sucursales.id_bandera
		inner join banderas on precios.id_bandera = banderas.id_bandera and precios.id_comercio = banderas.id_comercio
		where id_producto = $4;
	`,
		[
			`${DATA_PATH}/${latestDate}/precios.parquet`,
			`${DATA_PATH}/${latestDate}/sucursales.parquet`,
			`${DATA_PATH}/${latestDate}/banderas.parquet`,
			data.id
		]
	);
	const rows = reader.getRowObjects().map((row) => {
		for (const key in row) {
			if (row[key] instanceof DuckDBDecimalValue) {
				row[key] = row[key].toDouble();
			}
		}
		return row;
	});
	console.timeEnd('getProduct');

	if (!dev)
		setHeaders({
			'Cache-Control': 'public, max-age=600'
		});

	return { old: false, id_producto: data.id, precios: rows };
	// const id = data.id;
	// const aWeekAgo = subDays(new Date(), 5);
	// const preciosRes = await getProduct(
	// 	id,
	// 	sql`date > ${formatISO(aWeekAgo, { representation: 'date' })}`
	// );

	// if (preciosRes.length == 0) {
	// 	const preciosOldRes = await getProduct(id, sql`TRUE`);

	// 	if (preciosOldRes.length == 0) {
	// 		return error(404, `Producto ${params.id} no encontrado`);
	// 	}

	// 	return {
	// 		precios: preciosOldRes,
	// 		id_producto: id,
	// 		old: true
	// 	};
	// }

	// return {
	// 	precios: preciosRes,
	// 	id_producto: id,
	// 	old: false
	// };
};
