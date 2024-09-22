<script lang="ts">
	// Parent has to be position relative
	import { LoaderCircle } from 'lucide-svelte';

	export let loading = false;
</script>

{#if loading}
	<div class="absolute inset-0 flex items-center justify-center">
		<LoaderCircle class="h-4 w-4 animate-spin" />
	</div>
	<div class="invisible">
		<slot />
	</div>
{:else}
	<slot />
{/if}
