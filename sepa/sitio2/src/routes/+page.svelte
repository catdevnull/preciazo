<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<h1 class="flex text-3xl font-bold">
	preciazo<small class="text-xs">alpha</small>
</h1>
<h2>actualmente tengo {data.count} registros de precios</h2>
