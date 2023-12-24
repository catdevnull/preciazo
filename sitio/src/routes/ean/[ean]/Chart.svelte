<script lang="ts">
  import type { Precio } from "db-datos/schema";
  // import dayjs from "dayjs";
  import ChartJs from "./ChartJs.svelte";

  export let precios: Precio[];

  $: datasets = precios
    .map((p) => new URL(p.url!).hostname)
    .filter(onlyUnique)
    .map((host) => {
      const ps = precios
        .filter((p) => new URL(p.url!).hostname === host)
        .filter(
          (p): p is Precio & { precioCentavos: number } =>
            p.precioCentavos !== null,
        );
      return {
        label: host,
        data: [
          ...ps.map((p) => ({
            x: p.fetchedAt,
            y: p.precioCentavos / 100,
          })),
          // lie
          // ...ps.map((p) => ({
          //   x: dayjs(p.fetchedAt).add(14, "day").toDate(),
          //   y: p.precioCentavos / 100 + 100,
          // })),
        ],
        fill: false,

        borderColor: `${host}`,
        tension: 0.1,
      };
    });
  function onlyUnique(value: any, index: any, self: string | any[]) {
    return self.indexOf(value) === index;
  }
</script>

<div class="h-[300px] w-full min-w-[500px]">
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
