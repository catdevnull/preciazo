<script lang="ts">
  import ProductPreview from "$lib/ProductPreview.svelte";
  import type { PageData } from "./$types";

  export let data: PageData;
  $: precios = data.precios.filter(
    (d): d is { ean: string; name: string; imageUrl: string | null } =>
      !!d.name,
  );
  $: productos = precios.reduce(
    (prev, curr) => [
      ...prev,
      ...(prev.find((p) => p.ean === curr.ean) ? [] : [curr]),
    ],
    [] as { ean: string; name: string; imageUrl: string | null }[],
  );
</script>

<h1 class="text-xl">WIP</h1>

<section>
  <h2 class="text-lg font-bold">Ejemplos</h2>
  <ul>
    <li>
      <a href="/ean/7790070410795">
        Cookies Sabor Vainilla Con Chips De Chocolate Exquisita Paq 300 Grm
      </a>
    </li>
    <li>
      <a href="/ean/7794000006911">
        Sopa Instantánea KNORR QUICK Zapallo Romero Sobres 5 Un.
      </a>
    </li>
    <li>
      <a href="/ean/7798062540253">Agua Saborizada Levité Pera 1,5 Lts.</a>
    </li>
    <li>
      <a href="/ean/7790895000430">Gaseosa Coca-Cola Sabor Original 1,5 Lts.</a>
    </li>
    <li>
      <a href="/ean/7792200000128">Bizcochos Agridulc 9 De Oro Paq 200 Grm</a>
    </li>
  </ul>
</section>

<section>
  <h2 class="text-lg font-bold">Random</h2>
  <ul class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each productos as product}
      <li>
        <ProductPreview {product} />
      </li>
    {/each}
  </ul>
</section>
