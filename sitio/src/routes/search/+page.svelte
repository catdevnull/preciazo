<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;
</script>

{#if data.results}
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
