<script lang="ts">
	import type { PageData } from './$types';
	import { ArrowLeft } from 'lucide-svelte';
	import Map from '$lib/components/Map.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import {} from '$app/navigation';

	export let data: PageData;

	const pesosFormatter = new Intl.NumberFormat('es-AR', {
		style: 'currency',
		currency: 'ARS'
	});
</script>

<div class="flex min-h-screen flex-col">
	<div class="flex items-stretch gap-3 px-2">
		<button on:click={() => window.history.back()}>
			<ArrowLeft class="size-8" />
		</button>
		<h1 class="flex items-center gap-2 py-1 text-2xl font-bold">
			{data.precios[0].productos_descripcion}
			<Badge>mostrando {data.precios.length} precios</Badge>
			<Badge variant="outline">EAN {data.id_producto}</Badge>
		</h1>
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
						`precio: ${pesosFormatter.format(precio.productos_precio_lista)}`,
						`sucursal: ${precio.sucursales_nombre}`,
						`descripcion del producto segun el comercio: ${precio.productos_descripcion}`
					].forEach((text) => {
						div.append(text);
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
