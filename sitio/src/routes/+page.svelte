<script lang="ts">
  import ProductPreview from "$lib/ProductPreview.svelte";
  import type { PageData } from "./$types";

  export let data: PageData;

  const categoryLabels: { [key in string]: string } = {
    almacen: "Almacen",
    bebidas: "Bebidas",
    "frutas-y-verduras": "Frutas y Verduras",
  };
</script>

{#each data.data as { category, products }}
  <section class="my-6">
    <h2 class="text-2xl font-bold">
      {categoryLabels[category] ?? category}
    </h2>
    <ul
      class="grid max-w-full grid-flow-col grid-rows-2 gap-x-8 gap-y-4 overflow-x-auto"
    >
      {#each products as product}
        <li class="w-96">
          <ProductPreview {product} />
        </li>
      {/each}
    </ul>
  </section>
{/each}
