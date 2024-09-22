<script lang="ts">
	import { format } from 'date-fns';
	import type { PageData } from './$types';
	import { Chart, Svg, Axis, Spline, Highlight, Tooltip, TooltipItem } from 'layerchart';
	import { scaleTime } from 'd3-scale';
	import { ArrowLeft } from 'lucide-svelte';
	import { generateGoogleMapsLink, pesosFormatter, processBanderaNombre } from '$lib/sepa-utils';
	import { MapPin } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { es } from 'date-fns/locale';

	export let data: PageData;

	$: dateSeriesData = data.preciosHistoricos
		.map((precio) => ({
			date: precio.dataset?.date ? new Date(precio.dataset?.date) : null,
			value: precio.productos_precio_lista
		}))
		.filter((precio): precio is { date: Date; value: number } => !!precio.date)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
	$: latestPrice = dateSeriesData[dateSeriesData.length - 1].value;
</script>

<div>
	<div class="max-w-screen flex items-stretch gap-3 overflow-hidden px-2">
		<button on:click={() => window.history.back()}>
			<ArrowLeft class="size-8 flex-shrink-0" />
		</button>
		<div class="flex flex-wrap items-center gap-x-2 overflow-hidden p-1">
			<h1 class="overflow-hidden text-ellipsis whitespace-nowrap pb-1 text-2xl font-bold">
				{data.preciosHistoricos[0].productos_descripcion}
			</h1>
		</div>
	</div>
	<p class="px-4 py-2">
		Viendo precios del <strong
			>{data.sucursal?.bandera && processBanderaNombre(data.sucursal?.bandera)}</strong
		>
		en la sucursal <strong>"{data.sucursal?.sucursales_nombre}"</strong>
		{#if data.sucursal?.sucursales_calle}
			en {data.sucursal?.sucursales_calle}
			{data.sucursal?.sucursales_numero}
		{/if}
	</p>
	<div class="flex flex-col px-4 py-2">
		<span class="text-sm">Precio actual:</span>
		<span class="text-2xl font-bold">{pesosFormatter.format(latestPrice)}</span>
	</div>
	<div class="flex gap-2 px-4 py-2">
		{#if data.sucursal?.sucursales_calle}
			<Button
				href={generateGoogleMapsLink({
					sucursales_calle: data.sucursal?.sucursales_calle,
					sucursales_numero: data.sucursal?.sucursales_numero
				})}
				target="_blank"
				variant="outline"
				size="sm"
				class="inline-flex items-center gap-1"
			>
				<MapPin class="size-4" />
				Google Maps
			</Button>
		{/if}
	</div>
	<div class="h-[300px] border-y p-4">
		<Chart
			data={dateSeriesData}
			x="date"
			xScale={scaleTime()}
			y="value"
			yDomain={[0, null]}
			yNice
			padding={{ left: 16, bottom: 24 }}
			tooltip={{ mode: 'bisect-x' }}
		>
			<Svg>
				<Axis placement="left" grid rule />
				<Axis placement="bottom" format={(d) => format(d, 'dd/MM', { locale: es })} rule />
				<Spline class="stroke-primary stroke-2" />
				<Highlight points lines />
			</Svg>
			<Tooltip header={(data) => format(data.date, 'eee, MMMM do', { locale: es })} let:data>
				<TooltipItem label="value" value={data.value} />
			</Tooltip>
		</Chart>
	</div>
</div>
