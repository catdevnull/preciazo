// import { precios, sucursales } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as Sentry from '@sentry/sveltekit';
// import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	// const id = BigInt(params.id);
	// const id_comercio = parseInt(params.id_comercio);
	// const id_sucursal = parseInt(params.id_sucursal);
	// const sucursalQuery = db.query.sucursales.findFirst({
	// 	where: and(eq(sucursales.id_comercio, id_comercio), eq(sucursales.id_sucursal, id_sucursal)),
	// 	with: {
	// 		bandera: true
	// 	},
	// 	orderBy: (sucursales, { desc }) => [desc(sucursales.id_dataset)]
	// });
	// const sucursal = await Sentry.startSpan(
	// 	{
	// 		op: 'db.query',
	// 		name: sucursalQuery.toSQL().sql,
	// 		data: { 'db.system': 'postgresql' }
	// 		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// 	} as any,
	// 	() => sucursalQuery
	// );
	// const preciosHistoricosQuery = db.query.precios.findMany({
	// 	where: and(
	// 		eq(precios.id_producto, id),
	// 		eq(precios.id_comercio, id_comercio),
	// 		eq(precios.id_sucursal, id_sucursal)
	// 	),
	// 	with: {
	// 		dataset: true
	// 	}
	// });
	// const preciosHistoricosUncasted = await Sentry.startSpan(
	// 	{
	// 		op: 'db.query',
	// 		name: preciosHistoricosQuery.toSQL().sql,
	// 		data: { 'db.system': 'postgresql' }
	// 		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// 	} as any,
	// 	() => preciosHistoricosQuery
	// );
	// const preciosHistoricos = preciosHistoricosUncasted.map((precio) => ({
	// 	...precio,
	// 	productos_precio_lista:
	// 		precio.productos_precio_lista && parseFloat(precio.productos_precio_lista)
	// }));
	// setHeaders({
	// 	'Cache-Control': 'public, max-age=600'
	// });
	// return { preciosHistoricos, sucursal };
};
