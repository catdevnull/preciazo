<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;
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
      <a href="/ean/7794000006911"
        >Sopa Instantánea KNORR QUICK Zapallo Romero Sobres 5 Un.</a
      >
    </li>
    <li>
      <a href="/ean/7798062540253">Agua Saborizada Levité Pera 1,5 Lts.</a>
    </li>
    <li>
      <a href="/ean/7790895000430">Gaseosa Coca-Cola Sabor Original 1,5 Lts.</a>
    </li>
  </ul>
</section>

<section>
  <h2 class="text-lg font-bold">Random</h2>
  <ul>
    {#each data.precios as product}
      <li>
        <a href={`/ean/${product.ean}`}>
          {product.name}
        </a>
      </li>
    {/each}
  </ul>
</section>
