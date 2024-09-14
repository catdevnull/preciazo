<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let search = $page.params.query ?? '';

	function handleSubmit() {
		goto(`/search/${encodeURIComponent(search)}`);
	}
</script>

<form class="flex gap-2" on:submit|preventDefault={handleSubmit}>
	<Input placeholder="Buscar productos" bind:value={search} />
	<Button>Buscar</Button>
</form>
