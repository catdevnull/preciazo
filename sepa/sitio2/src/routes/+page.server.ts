import { dev } from '$app/environment';
import { instance, DATA_PATH } from '$lib/duckdb';
import type { PageServerLoad } from './$types';

let cachedCount: null | {
	total: number;
	unique: number;
	lastUpdated: Date;
} = null;

async function getCount() {
	if (cachedCount && +cachedCount.lastUpdated + 1000 * 60 * 60 > +new Date()) {
		return cachedCount;
	}
	const conn = await instance.connect();
	const res = await conn.runAndReadAll(`
		select count(*) as count, count(distinct id_producto) as unique from '${DATA_PATH}/20*/precios.parquet';
	`);
	const { count, unique } = res.getRowObjects()[0];
	cachedCount = { total: count as number, unique: unique as number, lastUpdated: new Date() };
	return cachedCount;
}

export const load: PageServerLoad = async ({ setHeaders }) => {
	if (!dev)
		setHeaders({
			'Cache-Control': 'public, max-age=600'
		});
	console.time('count');
	const { total, unique } = await getCount();
	console.timeEnd('count');

	return {
		total,
		unique
	};
};
