<script lang="ts">
	import type { PageData } from './$types';
	import { ArrowLeft } from 'lucide-svelte';
	import Map from '$lib/components/Map.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import {} from '$app/navigation';
	import { generateGoogleMapsLink, pesosFormatter, processBanderaNombre } from '$lib/sepa-utils';

	export let data: PageData;
</script>

<svelte:head>
	<title>{data.precios[0].productos_descripcion} - Preciazo</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<div class="max-w-screen flex items-stretch gap-3 overflow-hidden px-2">
		<button on:click={() => window.history.back()}>
			<ArrowLeft class="size-8 flex-shrink-0" />
		</button>
		<div class="flex flex-wrap items-center gap-x-2 overflow-hidden p-1">
			<h1 class="overflow-hidden text-ellipsis whitespace-nowrap pb-1 text-2xl font-bold">
				{data.precios[0].productos_descripcion}
			</h1>
			<Badge>{data.precios.length} precios</Badge>
			<Badge variant="outline">EAN {data.id_producto}</Badge>
		</div>
	</div>

	<Map
		mapMap={(map, L) => {
			// var markers = L.MarkerClusterGroup();
			const myRenderer = L.canvas({ padding: 0.5 });
			const prices = data.precios.map((p) => p.productos_precio_lista);
			const sortedPrices = prices.sort((a, b) => a - b);
			const q1Index = Math.floor(sortedPrices.length * 0.1);
			const q3Index = Math.floor(sortedPrices.length * 0.9);
			const iqr = sortedPrices[q3Index] - sortedPrices[q1Index];
			const lowerBound = sortedPrices[q1Index] - 1.5 * iqr;
			const upperBound = sortedPrices[q3Index] + 1.5 * iqr;
			const filteredPrices = sortedPrices.filter((p) => p >= lowerBound && p <= upperBound);
			const min = Math.min(...filteredPrices);
			const max = Math.max(...filteredPrices);
			console.log({ min, max, outliers: prices.length - filteredPrices.length });

			// For each row in data, create a marker and add it to the map
			// For each row, columns `Latitude`, `Longitude`, and `Title` are required
			for (const precio of data.precios) {
				const normalizedPrice = (precio.productos_precio_lista - min) / (max - min);
				// Safari doesn't support color-mix, so we'll use a fallback
				const color = getSafeColor(normalizedPrice);

				const createElement = () => {
					const div = document.createElement('div');

					[
						`fecha del precio: ${precio.dataset_date}`,
						`precio: ${pesosFormatter.format(precio.productos_precio_lista)}`,
						`comercio: ${processBanderaNombre(precio)} (${precio.comercio_razon_social} CUIT ${precio.comercio_cuit})`,
						`sucursal: ${precio.sucursales_nombre}`,
						`dirección: ${precio.sucursales_calle} ${precio.sucursales_numero}`,
						() => {
							const a = document.createElement('a');
							if (precio.sucursales_calle) {
								a.href = generateGoogleMapsLink({
									sucursales_calle: precio.sucursales_calle,
									sucursales_numero: precio.sucursales_numero
								});
							}
							a.target = '_blank';
							a.append('ver en Google Maps');
							return a;
						},
						`descripcion del producto segun el comercio: ${precio.productos_descripcion}`,
						() => {
							const a = document.createElement('a');
							a.href = `/id_producto/${data.id_producto}/sucursal/${precio.id_comercio}/${precio.id_sucursal}`;
							a.append('ver precios historicos');
							return a;
						}
					].forEach((el) => {
						div.append(typeof el === 'function' ? el() : el);
						div.append(document.createElement('br'));
					});
					return div;
				};

				var marker = L.circleMarker([precio.sucursales_latitud, precio.sucursales_longitud], {
					opacity: 1,
					renderer: myRenderer,
					color,
					radius: 5
				})
					.bindPopup(createElement)
					.addTo(map);
				marker.on('click', function (this: L.CircleMarker) {
					this.openPopup();
				});
			}

			// Helper function to get a color that works in Safari
			function getSafeColor(normalizedPrice: number) {
				const r = Math.round(255 * normalizedPrice);
				const g = Math.round(255 * (1 - normalizedPrice));
				return `rgb(${r}, ${g}, 0)`;
			}
		}}
	/>
</div>
