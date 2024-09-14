<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<div class="mx-auto max-w-screen-sm p-4">
	<SearchBar />
	<h1 class="my-2 text-2xl font-bold">Resultados para "{data.query}"</h1>
	{#each data.collapsedProductos as producto}
		<a href={`/id_producto/${producto.id_producto}`} class="my-2 block">
			<Card.Root class="transition-colors duration-200 hover:bg-gray-100">
				<Card.Header class="block px-3 py-2 pb-0">
					<Badge
						>{Array.from(producto.marcas)
							.filter((m) => !['sin marca', 'VARIOS'].includes(m))
							.filter((m) => m?.trim().length > 0)
							.join('/')}</Badge
					>
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
</div>
