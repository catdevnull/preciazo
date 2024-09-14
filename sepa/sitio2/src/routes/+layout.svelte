<script>
	// import { cubicIn, cubicOut } from 'svelte/easing';
	import '../app.css';
	// import { fly } from 'svelte/transition';

	export let data;
</script>

<svelte:head>
	{#if import.meta.env.PROD}
		<script
			defer
			src="https://umami.experimentos.nulo.ar/script.js"
			data-website-id="3d9215d1-f15c-4797-abff-d621da254930"
		></script>
	{/if}
</svelte:head>

<!-- {#key data.pathname}
	<div
		in:fly={{ easing: cubicOut, x: 10, duration: 150, delay: 300 }}
		out:fly={{ easing: cubicIn, x: -10, duration: 150 }}
	> -->
<slot />
<!-- </div>
{/key} -->
