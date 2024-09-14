<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import type L from 'leaflet';

	let mapEl: HTMLDivElement;
	export let mapMap: (map: L.Map, l: typeof L) => void;
	let map: L.Map | undefined;

	onMount(async () => {
		const L = await import('leaflet');
		const L1 = await import('leaflet.markercluster');
		// Set up initial map center and zoom level
		map = L.map(mapEl, {
			center: [-34.599722222222, -58.381944444444], // EDIT latitude, longitude to re-center map
			zoom: 9, // EDIT from 1 to 18 -- decrease to zoom out, increase to zoom in
			scrollWheelZoom: true, // Changed to true to enable zoom with scrollwheel
			tap: false
		});

		/* Control panel to display map layers */
		// var controlLayers = L.control.layers( null, null, {
		//   position: "topright",
		//   collapsed: false
		// }).addTo(map);

		// display Carto basemap tiles with light features and labels
		L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			attribution:
				'&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>'
		}).addTo(map);
		mapMap(map, L);
	});

	onDestroy(() => {
		map?.remove();
		map = undefined;
	});
</script>

<div class="map" bind:this={mapEl}></div>

<style>
	.map {
		width: 100%;
		height: 100%;
		min-height: 500px;
	}
</style>
