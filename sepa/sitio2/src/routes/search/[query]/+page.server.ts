import type { PageServerLoad } from './$types';
import { instance } from '$lib/duckdb';
import { dev } from '$app/environment';
import type { DuckDBListValue } from '@duckdb/node-api';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const query = params.query
		.replaceAll(/á/giu, 'a')
		.replaceAll(/é/giu, 'e')
		.replaceAll(/í/giu, 'i')
		.replaceAll(/ó/giu, 'o')
		.replaceAll(/ú/giu, 'u')
		.replaceAll(/ñ/giu, 'n');
	const conn = await instance.connect();
	// i'm still not sure why this is needed :3
	await conn.run(`SET scalar_subquery_error_on_multiple_rows=false;`);
	const reader = await conn.runAndReadAll(
		`
		select
			id_producto, ANY_VALUE(id_comercio) as id_comercio,
			array_agg(productos_descripcion) as productos_descripcion, array_agg(COALESCE(productos_marca, '')) as productos_marca, ANY_VALUE(productos_unidad_medida_referencia) as productos_unidad_medida_referencia,
			ANY_VALUE(score) as score,
			count(id_producto) as count_comercios
		from (
			select *,
				fts_main_metadata.match_bm25(id_producto, $1, fields := 'productos_descripcion') as score
			from metadata
		) sq
		 where score is not null
		 group by id_producto
		 order by count(id_producto) desc, max(score) desc;
	`,
		[query]
	);
	type DuckDBResult = {
		id_producto: bigint;
		id_comercio: number;
		productos_descripcion: DuckDBListValue;
		productos_marca: DuckDBListValue;
		productos_unidad_medida_referencia: string | null;
		score: number;
		count_comercios: bigint;
	};

	const results = (reader.getRowObjects() as unknown as DuckDBResult[]).map((r) => ({
		...r,
		productos_descripcion: r.productos_descripcion.items as readonly string[],
		productos_marca: r.productos_marca.items as readonly string[]
	}));

	if (!dev)
		setHeaders({
			'Cache-Control': 'public, max-age=600'
		});

	return { results, query };
};
