import { dev } from '$app/environment';
import { instance, DATA_PATH } from '$lib/duckdb';
import type { PageServerLoad } from './$types';

let cachedCount: null | {
	total: number;
	unique: number;
	lastUpdated: Date;
} = null;

getCount().catch((error) => console.error('Error fetching count:', error));

async function getCount() {
	try {
		const conn = await instance.connect();
		const res = await conn.runAndReadAll(`
			select count(*) as count, count(distinct id_producto) as unique from '${DATA_PATH}/20*/precios.parquet';
		`);
		const { count, unique } = res.getRowObjects()[0];
		cachedCount = { total: count as number, unique: unique as number, lastUpdated: new Date() };
		console.log('cached', cachedCount);
	} catch (error) {
		console.error('Error fetching count data:', error);
	}
}

export const load: PageServerLoad = async ({ setHeaders }) => {
	if (!dev)
		setHeaders({
			'Cache-Control': 'public, max-age=600'
		});

	if (!cachedCount) {
		// Trigger a background fetch
		getCount().catch((error) => console.error('Error fetching count:', error));

		return { status: 'loading' };
	}

	if (+cachedCount.lastUpdated + 1000 * 60 * 60 < +new Date()) {
		getCount().catch((error) => console.error('Error refreshing count:', error));
	}

	return {
		status: 'success',
		total: cachedCount.total,
		unique: cachedCount.unique
	};
};
