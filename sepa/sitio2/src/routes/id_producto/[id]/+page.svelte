<script lang="ts">
	import type { PageData } from './$types';
	import { ArrowLeft, ArrowRight, MapPin } from 'lucide-svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { goto } from '$app/navigation';
	import {
		dateFormatter,
		generateGoogleMapsLink,
		pesosFormatter,
		processBanderaNombre
	} from '$lib/sepa-utils';
	import { page } from '$app/stores';
	import {
		DefaultMarker,
		MapLibre,
		Popup,
		GeoJSON,
		CircleLayer,
		SymbolLayer,
		HeatmapLayer
	} from 'svelte-maplibre';
	import style from '$lib/components/map_style.json';
	import type { GeoJSON as GeoJSONType } from 'geojson';
	import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl';
	import Button from '$lib/components/ui/button/button.svelte';
	import { TriangleAlert } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { differenceInDays } from 'date-fns';

	export let data: PageData;

	$: id_producto = $page.params.id;
	const query = $page.url.searchParams.get('query');

	function generateGeoJSON(precios: (typeof data)['precios']): GeoJSONType {
		// const prices = precios.map((p) => p.productos_precio_lista);
		// const sortedPrices = prices.sort((a, b) => a - b);
		// const q1Index = Math.floor(sortedPrices.length * 0.1);
		// const q3Index = Math.floor(sortedPrices.length * 0.9);
		// const iqr = sortedPrices[q3Index] - sortedPrices[q1Index];
		// const lowerBound = sortedPrices[q1Index] - 1.5 * iqr;
		// const upperBound = sortedPrices[q3Index] + 1.5 * iqr;
		// const filteredPrices = sortedPrices.filter((p) => p >= lowerBound && p <= upperBound);

		return {
			type: 'FeatureCollection',
			features: precios.map((precio) => ({
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [precio.sucursales_longitud, precio.sucursales_latitud]
				},
				properties: {
					id: Math.random(),
					id_comercio: precio.id_comercio,
					id_sucursal: precio.id_sucursal,
					precio: precio.productos_precio_lista,
					nombre: precio.sucursales_nombre,
					descripcion: precio.productos_descripcion,
					direccion: `${precio.sucursales_calle} ${precio.sucursales_numero ?? ''}`,
					comercio: processBanderaNombre(precio),
					fecha: precio.dataset_date
				}
			}))
		};
	}
	$: geoJSON = generateGeoJSON(data.precios);
	$: newest = new Date(
		data.precios.sort((a, b) => {
			const dateA = b.dataset_date ? new Date(b.dataset_date) : new Date(0);
			const dateB = a.dataset_date ? new Date(a.dataset_date) : new Date(0);
			return dateA.getTime() - dateB.getTime();
		})[0].dataset_date ?? new Date(0)
	);

	const relativeTimeFormatter = new Intl.RelativeTimeFormat('es-AR', {
		style: 'long',
		numeric: 'auto'
	});

	function hoverStateFilter(
		offValue: number,
		onValue: number
	): DataDrivenPropertyValueSpecification<number> {
		return ['case', ['boolean', ['feature-state', 'hover'], false], onValue, offValue];
	}
</script>

<svelte:head>
	<title>{data.precios[0].productos_descripcion} - Preciazo</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<div class="max-w-screen flex items-stretch gap-3 overflow-hidden px-2">
		<button
			on:click={() =>
				goto(
					`/search/${encodeURIComponent(query ?? data.precios[0].productos_descripcion ?? $page.params.id)}`
				)}
		>
			<ArrowLeft class="size-8 flex-shrink-0" />
		</button>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden p-1">
			<h1 class="overflow-hidden text-ellipsis whitespace-nowrap pb-1 text-2xl font-bold">
				{data.precios[0].productos_descripcion}
			</h1>
			<Badge>{data.precios.length} precios</Badge>
			<Badge variant="outline">EAN {data.id_producto}</Badge>
			{#if data.old}
				<Dialog.Root>
					<Dialog.Trigger>
						<Badge variant="destructive" class="flex items-center gap-1">
							<TriangleAlert class="size-4" />
							Precios antiguos
						</Badge>
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Title>Precios antiguos</Dialog.Title>
						<Dialog.Description>
							Los datos de esta pagina son de hace al menos {relativeTimeFormatter.format(
								-differenceInDays(new Date(), new Date(newest)),
								'days'
							)}. Es muy probable que este producto especifico este descontinuado. Revisa las fechas
							de cada precio para confirmar.
						</Dialog.Description>
					</Dialog.Content>
				</Dialog.Root>
			{/if}
		</div>
	</div>
	<MapLibre
		style={style as any}
		class="relative h-full max-h-full min-h-[50vh] w-full flex-1"
		standardControls
		zoom={9}
		center={[-58.381944444444, -34.599722222222]}
	>
		<!-- cluster={{
				radius: 50,
				// maxZoom: 14,
				maxZoom: 14,
				properties: {
					total_precio: ['+', ['get', 'precio']],
					precio_promedio: [
						'number',
						['/', ['+', ['number', ['get', 'precio']]], ['get', 'point_count']]
					]
				}
			}} -->
		<GeoJSON id="precios" data={geoJSON}>
			<!-- <HeatmapLayer
				paint={{
					// Increase the heatmap weight based on price magnitude
					'heatmap-weight': [
						'interpolate',
						['linear'],
						['get', 'precio'], // Get precio from properties
						Math.min(...data.precios.map((p) => p.productos_precio_lista)), // Start at 0 weight for minimum price
						0,
						Math.max(...data.precios.map((p) => p.productos_precio_lista)), // Adjust this max value based on your price range
						1
					],
					// Increase the heatmap intensity by zoom level
					'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
					// Color ramp for heatmap. Domain is 0 (low) to 1 (high).
					'heatmap-color': [
						'interpolate',
						['linear'],
						['heatmap-density'],
						0,
						'rgba(0, 255, 0, 0)',
						// 0.2,
						// 'rgb(0, 204, 255)',
						// 0.4,
						// 'rgb(128, 255, 128)',
						// 0.6,
						// 'rgb(255, 255, 102)',
						// 0.8,
						// 'rgb(255, 128, 0)',
						0.9,
						'rgb(100, 255, 0)',
						1,
						'rgb(255, 0, 0)'
					],
					// Adjust the heatmap radius by zoom level
					'heatmap-radius': [
						'interpolate',
						['linear'],
						['get', 'precio'],
						Math.min(...data.precios.map((p) => p.productos_precio_lista)),
						2,
						Math.max(...data.precios.map((p) => p.productos_precio_lista)),
						10
					],
					'heatmap-opacity': 0.8
				}}
			/> -->

			<!-- <CircleLayer
				id="cluster_circles"
				applyToClusters
				hoverCursor="pointer"
				paint={{
					'circle-color': [
						'step',
						['get', 'total_precio'],
						'#51bbd6',
						10,
						'#f1f075',
						30,
						'#f28cb1'
					],
					// 'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 25],
					'circle-radius': 5,
					'circle-stroke-color': '#fff',
					'circle-stroke-width': 1,
					'circle-stroke-opacity': hoverStateFilter(0, 1)
				}}
				manageHoverState
				on:click={(e) => {
					console.log(e);
				}}
			>
				<!-- <Popup openOn="click" closeOnClickInside let:data>
					{#if data?.properties}
						<div class="p-2">
							<p class="font-bold">Grupo de {data.properties.point_count} precios</p>
							<p>Precio promedio: ${data.properties.precio_promedio.toFixed(2)}</p>
						</div>
					{/if}
				</Popup> --
			</CircleLayer>

			<SymbolLayer
				id="cluster_labels"
				interactive={false}
				applyToClusters
				layout={{
					'text-field': [
						'format',
						['get', 'point_count_abbreviated'],
						{},
						'\n$',
						{},
						['number-format', ['get', 'total_precio'], { 'max-fraction-digits': 2 }],
						{ 'font-scale': 0.8 }
					],
					'text-size': 12,
					'text-offset': [0, -0.1]
				}}
			/>-->

			<CircleLayer
				id="precio_circle"
				applyToClusters={false}
				hoverCursor="pointer"
				paint={{
					'circle-color': [
						'interpolate',
						['linear'],
						['get', 'precio'],
						Math.min(...data.precios.map((p) => p.productos_precio_lista)),
						'rgba(0,255,0,0)',
						Math.max(...data.precios.map((p) => p.productos_precio_lista)),
						'rgba(255,0,0,1)'
					],
					'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 6],
					'circle-stroke-width': 1,
					'circle-stroke-color': '#fff'
					// 'circle-stroke-opacity': hoverStateFilter(0, 1)
				}}
			>
				<Popup openOn="click" closeOnClickInside let:data>
					{#if data?.properties}
						<div class="flex flex-col gap-2 px-3 py-2">
							<div class="flex flex-col gap-1">
								<span class="text-xs uppercase leading-none text-neutral-500">
									{dateFormatter.format(new Date(data.properties.fecha))}
								</span>
								<span class="text-xl font-bold leading-none">
									{pesosFormatter.format(data.properties.precio)}
								</span>
							</div>

							<div class="flex gap-2">
								<div class="flex flex-col leading-none">
									<span class="font-medium">{data.properties.comercio}</span>
									<span class="text-sm">{data.properties.direccion}</span>
								</div>

								<Button
									href={generateGoogleMapsLink({
										sucursales_calle: data.properties.sucursales_calle,
										sucursales_numero: data.properties.sucursales_numero
									})}
									target="_blank"
									variant="outline"
									size="icon_sm"
									class="inline-flex items-center gap-1"
								>
									<MapPin class="size-4" />
								</Button>
							</div>

							<div>
								<Button
									variant="default"
									size="xs"
									href={`/id_producto/${id_producto}/sucursal/${data.properties.id_comercio}/${data.properties.id_sucursal}`}
									class="group"
								>
									Precios históricos
									<ArrowRight class="mx-1 size-4 transition-transform group-hover:translate-x-1" />
								</Button>
							</div>
						</div>
					{/if}
				</Popup>
			</CircleLayer>
		</GeoJSON>
	</MapLibre>
</div>

<style>
	:global(.maplibregl-popup-content) {
		border-radius: 0.3rem;
		padding: 0;
	}
</style>
