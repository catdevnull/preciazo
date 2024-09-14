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

	<title>Preciazo</title>
	<meta
		name="description"
		content="Busca precios de productos en distintas cadenas de supermercados en Argentina."
	/>
	<meta content="index, follow" name="robots" />
	<meta property="og:title" content="Preciazo" />
	<meta
		property="og:description"
		content="Busca precios de productos en distintas cadenas de supermercados en Argentina."
	/>
	<meta property="og:image" content="https://preciazo.nulo.in/favicon.png" />
	<meta property="og:url" content={`https://preciazo.nulo.in${data.pathname}`} />
	<meta property="og:type" content="website" />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:site" content="@esoesnulo" />
	<meta name="twitter:creator" content="@esoesnulo" />
	<meta name="twitter:title" content="Preciazo" />
	<meta
		name="twitter:description"
		content="Busca precios de productos en distintas cadenas de supermercados en Argentina."
	/>
	<meta name="twitter:image" content="https://preciazo.nulo.in/favicon.png" />
</svelte:head>

<!-- {#key data.pathname}
	<div
		in:fly={{ easing: cubicOut, x: 10, duration: 150, delay: 300 }}
		out:fly={{ easing: cubicIn, x: -10, duration: 150 }}
	> -->
<slot />
<!-- </div>
{/key} -->
