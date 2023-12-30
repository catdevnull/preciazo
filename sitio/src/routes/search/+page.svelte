<script lang="ts">
  import ProductPreview from "$lib/ProductPreview.svelte";
  import type { PageData } from "./$types";

  export let data: PageData;
</script>

{#if data.results}
  <header class="my-2">
    <h1 class="text-2xl font-bold">Resultados para "{data.query}"</h1>
  </header>
  <ul class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each data.results as product}
      <li>
        <ProductPreview {product} />
      </li>
    {/each}
  </ul>
{:else}
  Probá buscando algo.
{/if}
