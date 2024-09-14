<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import style from './map_style.json';
	import type L from 'leaflet';

	let mapEl: HTMLDivElement;
	export let mapMap: (map: L.Map, l: typeof L) => void;
	let map: L.Map | undefined;

	onMount(async () => {
		window.L = await import('leaflet');
		const L2 = await import('maplibre-gl');
		const L3 = await import('@maplibre/maplibre-gl-leaflet');
		// Set up initial map center and zoom level
		map = window.L.map(mapEl, {
			center: [-34.599722222222, -58.381944444444], // EDIT latitude, longitude to re-center map
			zoom: 9, // EDIT from 1 to 18 -- decrease to zoom out, increase to zoom in
			scrollWheelZoom: true // Changed to true to enable zoom with scrollwheel
			// tap: false
		});

		window.L.maplibreGL({
			style: style as any,
			attribution:
				'&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
		} as any).addTo(map);

		// display Carto basemap tiles with light features and labels
		// L.tileLayer.provider('Stadia.AlidadeSmoothBackground').addTo(map);
		mapMap(map, window.L);
	});

	onDestroy(() => {
		map?.remove();
		map = undefined;
	});
</script>

<div class="wrapper flex-auto">
	<div class="map" bind:this={mapEl}></div>
</div>

<style>
	.map {
		width: 100%;
		height: 100%;
		position: absolute !important;
	}
	.wrapper {
		position: relative;
		width: 100%;
		height: 100%;
	}
</style>
