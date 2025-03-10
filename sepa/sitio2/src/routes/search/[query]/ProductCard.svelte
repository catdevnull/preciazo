<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { parseMarcas } from '$lib/sepa-utils';
	import { beforeNavigate } from '$app/navigation';
	import Loading from '$lib/components/Loading.svelte';

	export let producto: {
		id_producto: bigint;
		productos_marca: readonly string[];
		productos_descripcion: readonly string[];
		productos_unidad_medida_referencia: string | null;
		score: number;
		count_comercios: bigint;
	};
	export let query: string | undefined;

	let loading = false;
	beforeNavigate((x) => {
		if (x.to?.params?.id === producto.id_producto.toString()) {
			loading = true;
		}
	});
</script>

<a
	href={`/id_producto/${producto.id_producto}?query=${encodeURIComponent(query ?? producto.productos_descripcion[0])}`}
	class="my-2 block"
>
	<Card.Root class="relative transition-colors duration-200 hover:bg-gray-100">
		<Loading {loading}>
			<Card.Header class="block px-3 py-2 pb-0">
				<Badge>{parseMarcas(producto.productos_marca).join('/')}</Badge>
				<Badge variant="outline"
					>en
					{producto.count_comercios} cadena{#if producto.count_comercios > 1}s{/if}
				</Badge>
				<Badge variant="outline">EAN {producto.id_producto}</Badge>
			</Card.Header>
			<Card.Content class="px-3 py-2">
				{#each producto.productos_descripcion as description}
					<span>{description}</span>
					{#if description !== producto.productos_descripcion[producto.productos_descripcion.length - 1]}
						<span class="text-gray-500">⋅</span>{' '}
					{/if}
				{/each}
			</Card.Content>
		</Loading>
	</Card.Root>
</a>
