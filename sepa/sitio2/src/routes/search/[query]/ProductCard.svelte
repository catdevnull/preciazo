<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { parseMarcas } from '$lib/sepa-utils';
	import { beforeNavigate } from '$app/navigation';
	import Loading from '$lib/components/Loading.svelte';

	export let producto: {
		id_producto: string;
		marcas: string[];
		in_datasets_count: number;
		descriptions: string[];
	};

	let loading = false;
	beforeNavigate((x) => {
		if (x.to?.params?.id === producto.id_producto) {
			loading = true;
		}
	});
</script>

<a href={`/id_producto/${producto.id_producto}`} class="my-2 block">
	<Card.Root class="relative transition-colors duration-200 hover:bg-gray-100">
		<Loading {loading}>
			<Card.Header class="block px-3 py-2 pb-0">
				<Badge>{parseMarcas(Array.from(producto.marcas)).join('/')}</Badge>
				<Badge variant="outline"
					>en
					{producto.in_datasets_count} cadena{#if producto.in_datasets_count > 1}s{/if}
				</Badge>
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
		</Loading>
	</Card.Root>
</a>
