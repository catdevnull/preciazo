<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ArrowLeft } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import ProductCard from './ProductCard.svelte';

	export let data: PageData;
</script>

<svelte:head>
	<title>Resultados para "{data.query}" - Preciazo</title>
</svelte:head>

<div class="mx-auto max-w-screen-sm p-4">
	<Button on:click={() => goto('/')} class="mb-2 gap-1" variant="outline">
		<ArrowLeft />
		Volver al inicio
	</Button>
	<SearchBar />
	<h1 class="my-2 text-2xl font-bold">Resultados para "{data.query}"</h1>
	{#if data.results.length === 0}
		<p class="my-2 text-gray-600">
			No se encontraron resultados para "{data.query}". Probá buscando palabras clave como
			"alfajor", "ketchup" o "lenteja".
		</p>
	{:else}
		{#each data.results as producto}
			<ProductCard {producto} query={data.query} />
		{/each}
	{/if}
</div>
