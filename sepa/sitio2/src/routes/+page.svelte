<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import type { PageData } from './$types';

	const numberFormat = new Intl.NumberFormat('es-AR', {
		style: 'decimal'
	});

	export let data: PageData;
</script>

<div class="mx-auto max-w-screen-sm p-4">
	<h1 class="flex text-3xl font-bold">
		preciazo<small class="text-xs">alpha</small>
	</h1>
	<h2>¡actualmente tengo {numberFormat.format(data.count)} registros de precios!</h2>
	<SearchBar />
</div>
