import { env } from '$env/dynamic/private';
import { DuckDBInstance } from '@duckdb/node-api';

export const instance = await DuckDBInstance.create(':memory:');
{
	const conn = await instance.connect();
	await conn.run(`
	CREATE SECRET tigris (
		type s3,
		ENDPOINT 'fly.storage.tigris.dev',
		region 'auto'
	);
	`);
	await conn.run(`set enable_http_metadata_cache = true;`);
	await conn.run(`set parquet_metadata_cache = true;`);
	conn.close();
}

export const DATA_PATH = env.DATA_PATH ?? 's3://preciazo-sepa';
// export async function connect() {
// 	const connection = await instance.connect();
// 	return {
// 		[Symbol.dispose]: () => {
// 			connection.close();
// 		},
// 		conn: connection
// 	};
// }

export async function ensureMetadataTable() {
	const conn = await instance.connect();
	try {
		await conn.run(`begin;`);
		await conn.run(`install fts;`);
		await conn.run(`load fts;`);
		await conn.run(`CREATE TABLE metadata AS SELECT * FROM '${DATA_PATH}/metadata.parquet';`);
		await conn.run(`PRAGMA create_fts_index(
			'metadata', 'id_producto', 'productos_descripcion', 'productos_marca'
		);`);
		await conn.run(`commit;`);
		console.info('Metadata table created');
	} finally {
		conn.close();
	}
}
await ensureMetadataTable();

// select id_producto, ANY_VALUE(id_comercio), max(productos_descripcion), max(productos_marca), ANY_VALUE(productos_unidad_medida_referencia), ANY_VALUE(score), count(id_producto) from (select *, fts_main_metadata.match_bm25(id_producto, 'ketchup', fields := 'productos_descripcion') as score from metadata) sq where score is not null group by id_producto order by  count(id_producto) desc, max(score) desc;
