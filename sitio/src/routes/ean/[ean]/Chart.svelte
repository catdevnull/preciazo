<script lang="ts">
  // import dayjs from "dayjs";
  import ChartJs from "./ChartJs.svelte";
  import { hosts, colorBySupermercado } from "db-datos/supermercado";
  import type { Precio } from "./common";

  export let precios: Precio[];

  $: datasets = precios
    .map((p) => new URL(p.url!).hostname)
    .filter(onlyUnique)
    .map((host) => {
      const supermercado = hosts[host];

      const ps = precios
        .filter((p) => new URL(p.url!).hostname === host)
        .filter(
          (p): p is Precio & { precio_centavos: number } =>
            p.precio_centavos !== null,
        );
      return {
        label: supermercado,
        data: [
          ...ps.map((p) => ({
            x: p.fetched_at,
            y: p.precio_centavos / 100,
          })),
          // lie
          // ...ps.map((p) => ({
          //   x: dayjs(p.fetchedAt).add(14, "day").toDate(),
          //   y: p.precioCentavos / 100 + 100,
          // })),
        ],
        fill: false,

        borderColor: colorBySupermercado[supermercado],
        tension: 0.1,
      };
    });
  function onlyUnique(value: any, index: any, self: string | any[]) {
    return self.indexOf(value) === index;
  }
</script>

<div class="h-[300px] w-full bg-neutral-200 dark:invert">
  <ChartJs
    type="line"
    data={{ datasets }}
    options={{
      responsive: true,
      scales: {
        x: { type: "time" },
      },
    }}
  />
</div>
