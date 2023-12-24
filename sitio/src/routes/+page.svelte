<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;
</script>

<h1 class="text-xl">WIP</h1>

<ul>
  {#each data.precios as product}
    <li>
      <a href={`/ean/${product.ean}`}>
        {product.ean}
      </a>
    </li>
  {/each}
</ul>
