<script lang="ts">
  import { Supermercado, hosts } from "db-datos/supermercado";
  import type { PageData } from "./$types";
  import Chart from "./Chart.svelte";
  import type { Precio } from "./common";

  export let data: PageData;

  let urls: Map<Supermercado, Precio>;
  $: urls = data.precios.reduce((prev, curr) => {
    const url = new URL(curr.url);
    const supermercado = hosts[url.hostname];
    prev.set(supermercado, curr);
    return prev;
  }, new Map<Supermercado, Precio>());

  const classBySupermercado: { [supermercado in Supermercado]: string } = {
    [Supermercado.Dia]: "bg-[#d52b1e] focus:ring-[#d52b1e]",
    [Supermercado.Carrefour]: "bg-[#19549d] focus:ring-[#19549d]",
    [Supermercado.Coto]: "bg-[#e20025] focus:ring-[#e20025]",
    [Supermercado.Jumbo]: "bg-[#2dc850] focus:ring-[#2dc850]",
    [Supermercado.Farmacity]: "bg-[#EF7603] focus:ring-[#EF7603]",
  };

  const formatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  });
</script>

{#if data.meta}
  <h1 class="text-3xl font-bold">{data.meta.name}</h1>
  <img src={data.meta.image_url} alt={data.meta.name} class="max-h-48" />
  <div class="flex gap-2">
    {#each urls as [supermercado, { url, precio_centavos }]}
      <a
        href={url}
        rel="noreferrer noopener"
        target="_blank"
        class={`focus:shadow-outline inline-flex flex-col items-center justify-center rounded-md ${classBySupermercado[supermercado]} px-4 py-2 font-medium tracking-wide text-white transition-colors duration-200 hover:bg-opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2`}
      >
        {#if precio_centavos}
          <span class="text-lg font-bold"
            >{formatter.format(precio_centavos / 100)}</span
          >
        {/if}
        <span class="text-sm">{supermercado}</span>
      </a>
    {/each}
  </div>
{/if}

<Chart precios={data.precios} />
