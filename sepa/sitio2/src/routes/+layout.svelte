<script>
	// import { cubicIn, cubicOut } from 'svelte/easing';
	import '../app.css';
	// import { fly } from 'svelte/transition';

	export let data;
</script>

<!-- {#key data.pathname}
	<div
		in:fly={{ easing: cubicOut, x: 10, duration: 150, delay: 300 }}
		out:fly={{ easing: cubicIn, x: -10, duration: 150 }}
	> -->
<slot />
<!-- </div>
{/key} -->
