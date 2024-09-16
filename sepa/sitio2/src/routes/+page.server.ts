import { sql } from '$lib/server/db';
import type { PageServerLoad } from './$types';
import * as Sentry from '@sentry/sveltekit';

export const load: PageServerLoad = async ({ setHeaders }) => {
	// https://www.cybertec-postgresql.com/en/postgresql-count-made-fast/
	const q = sql`
  SELECT reltuples::bigint
  FROM pg_catalog.pg_class
  WHERE relname = 'precios';
  `;
	// https://github.com/getsentry/sentry-javascript/discussions/8117#discussioncomment-7623605
	const describe = await q.describe();
	const count = await Sentry.startSpan(
		{
			op: 'db.query',
			name: describe.string,
			data: { 'db.system': 'postgresql' }
			// these properties are important if you want to utilize Queries Performance
			// read more: https://docs.sentry.io/product/performance/queries/#span-eligibility
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
		() => q
	);

	setHeaders({
		'Cache-Control': 'public, max-age=600'
	});

	return {
		count: count[0].reltuples
	};
};
