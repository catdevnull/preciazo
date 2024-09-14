<script lang="ts">
	import type { PageData } from './$types';
	import Map from '$lib/components/Map.svelte';

	export let data: PageData;
</script>

<h1>Producto {data.precios[0].productos_descripcion}</h1>

<h2>cantidad de precios: {data.precios.length}</h2>

<div class="h-[80vh]">
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
				// const l = 0.8 - normalizedPrice * 0.8; // Lightness decreases as price increases
				// const a = -0.2 + normalizedPrice * 0.4; // Green to red
				// const b = 0.2 - normalizedPrice * 0.4; // Yellow to blue
				const color = `color-mix(in lab, yellow, red ${normalizedPrice * 100}%)`;
				// const color = `oklch(${l} ${Math.sqrt(a * a + b * b)} ${Math.atan2(b, a)})`;
				// console.log(row)
				var marker = L.circleMarker([precio.sucursales_latitud, precio.sucursales_longitud], {
					opacity: 1,
					renderer: myRenderer,
					color,
					radius: 5
					// riseOnHover: false,
					// riseOffset: 0
				})
					.bindPopup(
						`precio: ${precio.productos_precio_lista}<br>sucursal: ${precio.sucursales_nombre}<br>descripcion: ${precio.productos_descripcion}`
					)
					.addTo(map);
				marker.on('click', function(this: L.CircleMarker) {
					this.openPopup();
				});

				// markers.addLayer(marker);
			}
			// map.addLayer(markers);
		}}
	/>
</div>
