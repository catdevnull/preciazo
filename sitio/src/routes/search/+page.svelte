<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;
</script>

{#if data.results}
  <header class="my-2">
    <h1 class="text-2xl font-bold">Resultados para "{data.query}"</h1>
  </header>
  <ul>
    {#each data.results as result}
      <li>
        <a href={`/ean/${result.ean}`}>
          {result.name}
        </a>
      </li>
    {/each}
  </ul>
{:else}
  Probá buscando algo.
{/if}
