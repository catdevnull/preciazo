<script lang="ts">
  import { Supermercado, hosts } from "db-datos/supermercado";
  import type { PageData } from "./$types";
  import Chart from "./Chart.svelte";

  export let data: PageData;

  let urls: Map<Supermercado, string>;
  $: urls = data.precios.toReversed().reduce((prev, curr) => {
    const url = new URL(curr.url);
    const supermercado = hosts[url.hostname];
    prev.set(supermercado, curr.url);
    return prev;
  }, new Map<Supermercado, string>());

  const classBySupermercado: { [supermercado in Supermercado]: string } = {
    [Supermercado.Dia]: "bg-[#d52b1e] focus:ring-[#d52b1e]",
    [Supermercado.Carrefour]: "bg-[#19549d] focus:ring-[#19549d]",
    [Supermercado.Coto]: "bg-[#e20025] focus:ring-[#e20025]",
  };
</script>

{#if data.meta}
  <h1 class="text-3xl font-bold">{data.meta.name}</h1>
  <img src={data.meta.imageUrl} class="max-h-48" />
  <div class="flex gap-2">
    {#each urls as [supermercado, url]}
      <a
        href={url}
        rel="noreferrer noopener"
        target="_blank"
        class={`focus:shadow-outline inline-flex items-center justify-center rounded-md ${classBySupermercado[supermercado]} px-4 py-2 text-sm font-medium tracking-wide text-white transition-colors duration-200 hover:bg-opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2`}
      >
        Ver en {supermercado}
      </a>
    {/each}
  </div>
{/if}

<Chart precios={data.precios} />
