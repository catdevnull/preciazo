export function processBanderaNombre(comercio: {
	comercio_cuit?: string | null;
	comercio_bandera_nombre?: string | null;
}) {
	if (
		comercio.comercio_cuit === '30687310434' &&
		!comercio.comercio_bandera_nombre?.includes('Carrefour')
	) {
		return `Carrefour ${comercio.comercio_bandera_nombre}`;
	}
	if (comercio.comercio_cuit === '30678774495') {
		return `YPF ${comercio.comercio_bandera_nombre}`;
	}
	return comercio.comercio_bandera_nombre;
}

export function generateGoogleMapsLink(sucursal: {
	sucursales_calle: string;
	sucursales_numero?: string | null;
}) {
	const params = new URLSearchParams({
		query: `${sucursal.sucursales_calle} ${sucursal.sucursales_numero}`
	});
	return `https://www.google.com/maps/search/?api=1&${params.toString()}`;
}

export const pesosFormatter = new Intl.NumberFormat('es-AR', {
	style: 'currency',
	currency: 'ARS'
});

export function parseMarcas(marcas: readonly string[]) {
	const x = marcas
		.map((m) => m.trim().replaceAll(/['`´]/g, ''))
		.filter((m) => !['sin marca', 'VARIOS'].includes(m))
		.filter((m) => m.length > 0);
	if (x.length === 0) {
		return ['n/a'];
	}
	return Array.from(new Set(x));
}
