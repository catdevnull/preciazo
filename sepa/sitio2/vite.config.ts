import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sentrySvelteKit({
			sourceMapsUploadOptions: {
				org: 'nulo-inc',
				project: 'preciazo-sitio2',
				url: 'https://sentry.io/'
			}
		}),
		sveltekit()
	],
	optimizeDeps: {
		exclude: ['svelte-maplibre', 'bits-ui', 'layerchart']
	},
	ssr: {
		noExternal: ['bits-ui', 'svelte-maplibre', 'layerchart']
	}
});
