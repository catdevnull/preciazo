<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';

	let search = $page.params.query ?? '';

	let loading = false;
	beforeNavigate(() => {
		loading = true;
	});
	afterNavigate(() => {
		loading = false;
	});

	function handleSubmit() {
		goto(`/search/${encodeURIComponent(search)}`);
	}
</script>

<form class="flex gap-2" on:submit|preventDefault={handleSubmit}>
	<Input placeholder="Buscar productos" bind:value={search} disabled={loading} />
	<Button type="submit" {loading}>Buscar</Button>
</form>
