<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ArrowLeft } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	export let data: PageData;

	function parseMarcas(marcas: readonly string[]) {
		const x = marcas
			.map((m) => m.trim().replaceAll(/['`´]/g, ''))
			.filter((m) => !['sin marca', 'VARIOS'].includes(m))
			.filter((m) => m.length > 0);
		if (x.length === 0) {
			return ['n/a'];
		}
		return Array.from(new Set(x));
	}
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
	{#if data.collapsedProductos.length === 0}
		<p class="my-2 text-gray-600">
			No se encontraron resultados para "{data.query}". Tené en cuenta que actualmente, el algoritmo
			de búsqueda es muy básico. Probá buscando palabras clave como "alfajor", "ketchup" o
			"lenteja".
		</p>
	{:else}
		{#each data.collapsedProductos as producto}
			<a href={`/id_producto/${producto.id_producto}`} class="my-2 block">
				<Card.Root class="transition-colors duration-200 hover:bg-gray-100">
					<Card.Header class="block px-3 py-2 pb-0">
						<Badge>{parseMarcas(Array.from(producto.marcas)).join('/')}</Badge>
						<Badge variant="outline">en {producto.in_datasets_count} cadenas</Badge>
						<Badge variant="outline">EAN {producto.id_producto}</Badge>
					</Card.Header>
					<Card.Content class="px-3 py-2">
						{#each producto.descriptions as description}
							<span>{description}</span>
							{#if description !== producto.descriptions[producto.descriptions.length - 1]}
								<span class="text-gray-500">⋅</span>{' '}
							{/if}
						{/each}
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	{/if}
</div>
