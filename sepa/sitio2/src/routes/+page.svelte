<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import type { PageData } from './$types';

	const numberFormat = new Intl.NumberFormat('es-AR', {
		style: 'decimal'
	});

	export let data: PageData;
</script>

<div class="mx-auto max-w-screen-sm p-4">
	<h1 class="my-4 flex text-5xl font-bold">
		preciazo<small class="text-sm">alpha</small>
	</h1>
	<h2 class="my-4 text-lg font-medium text-gray-700">
		{#if data.status === 'loading'}
			<span class="animate-pulse">Cargando estadísticas...</span>
		{:else if data.status === 'success'}
			¡actualmente tengo {numberFormat.format(data.total)} registros de precios para {numberFormat.format(
				data.unique
			)} productos!
		{/if}
	</h2>
	<SearchBar />
	<footer class="prose my-4 text-sm text-gray-700">
		preciazo es una iniciativa de <a
			href="https://nulo.in/"
			target="_blank"
			rel="noopener noreferrer">Nulo</a
		>. usa la base de datos abierta
		<a href="https://datos.produccion.gob.ar/dataset/sepa-precios">Precios Claros - Base SEPA</a>
		del Ministerio de Economía. el código fuente está
		<a href="https://github.com/catdevnull/preciazo" target="_blank" rel="noopener noreferrer"
			>disponible en github</a
		>. podes contactarme en
		<a href="mailto:hola@nulo.in">hola@nulo.in</a>. twitter:
		<a href="https://x.com/esoesnulo" target="_blank" rel="noopener noreferrer">@esoesnulo</a>.
	</footer>
</div>
