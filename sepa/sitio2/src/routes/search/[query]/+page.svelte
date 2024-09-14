<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<ul>
	{#each data.productos as producto}
		<li>
			<a href={`/id_producto/${producto.id_producto}`}
				>{producto.productos_marca} - {producto.productos_descripcion}</a
			>
		</li>
	{/each}
</ul>
