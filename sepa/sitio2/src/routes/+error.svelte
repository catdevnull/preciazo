<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ArrowLeftIcon, HomeIcon } from 'lucide-svelte';
</script>

<div class="mx-auto flex max-w-screen-sm flex-col items-center justify-center gap-4 p-4">
	<h1 class="flex text-5xl font-bold">Error {$page.status} :(</h1>
	<p>{$page.error?.message}</p>

	<div class="flex gap-2">
		<Button
			on:click={() => {
				window.history.back();
			}}
			class="flex items-center gap-2"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Volver
		</Button>
		<Button variant="outline" href="/" class="flex items-center gap-2">
			<HomeIcon class="h-4 w-4" />
			Ir al inicio
		</Button>
	</div>
</div>
