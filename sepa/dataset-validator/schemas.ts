import { z } from "zod";

export const Comerico = z.object({
  id_comercio: z.string(),
  id_bandera: z.string(),
  comercio_cuit: z.string(),
  comercio_razon_social: z.string(),
  comercio_bandera_nombre: z.string(),
  comercio_bandera_url: z.string(),
  comercio_ultima_actualizacion: z.string(),
  comercio_version_sepa: z.string().optional(), // no es opcional pero a veces no lo agregan...
});

export const ProductoSegúnSpec = z.object({
  id_comercio: z.coerce.number(),
  id_bandera: z.coerce.number(),
  id_sucursal: z.coerce.number(),
  id_producto: z.coerce.number(),
  // 0 es ID interna del comercio, 1 es EAN/UPC-A
  productos_ean: z.union([z.literal("0"), z.literal("1")]),
  productos_descripcion: z.string(),
  productos_cantidad_presentacion: z.coerce.number(),
  productos_unidad_medida_presentacion: z.string(),
  productos_marca: z.string(),
  productos_precio_lista: z.coerce.number(),
  productos_precio_referencia: z.coerce.number(),
  productos_cantidad_referencia: z.coerce.number(),
  productos_unidad_medida_referencia: z.string(),
  productos_precio_unitario_promo1: z.coerce.number().optional(),
  productos_leyenda_promo1: z.string().optional(),
  productos_precio_unitario_promo2: z.coerce.number().optional(),
  productos_leyenda_promo2: z.string().optional(),
});
