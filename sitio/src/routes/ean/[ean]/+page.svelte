<script lang="ts">
  import type { PageData } from "./$types";
  import Chart from "./Chart.svelte";

  export let data: PageData;
</script>

{#if data.meta}
  <h1 class="text-3xl font-bold">{data.meta.name}</h1>
  <img src={data.meta.imageUrl} class="max-h-48" />
{/if}

<ul>
  {#each data.precios as precio}
    <li>
      {precio.url}
      :
      {#if precio.precioCentavos}
        {precio.precioCentavos / 100}
      {:else}
        {precio.inStock}
      {/if}
      ({precio.fetchedAt})
    </li>
  {/each}
</ul>

<Chart precios={data.precios} />
