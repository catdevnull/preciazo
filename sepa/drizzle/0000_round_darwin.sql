CREATE TABLE IF NOT EXISTS "datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"date" date,
	CONSTRAINT "datasets_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "precios" (
	"id_dataset" integer,
	"id_comercio" integer,
	"id_bandera" integer,
	"id_sucursal" integer,
	"id_producto" bigint,
	"productos_ean" integer,
	"productos_descripcion" text,
	"productos_cantidad_presentacion" numeric(10, 2),
	"productos_unidad_medida_presentacion" text,
	"productos_marca" text,
	"productos_precio_lista" numeric(10, 2),
	"productos_precio_referencia" numeric(10, 2),
	"productos_cantidad_referencia" numeric(10, 2),
	"productos_unidad_medida_referencia" text,
	"productos_precio_unitario_promo1" numeric(10, 2),
	"productos_leyenda_promo1" text,
	"productos_precio_unitario_promo2" numeric(10, 2),
	"productos_leyenda_promo2" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "productos_descripcion_index" (
	"id_producto" bigint,
	"productos_descripcion" text,
	"productos_marca" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sucursales" (
	"id_dataset" integer,
	"id_comercio" integer,
	"id_bandera" integer,
	"id_sucursal" integer,
	"sucursales_nombre" text,
	"sucursales_tipo" text,
	"sucursales_calle" text,
	"sucursales_numero" text,
	"sucursales_latitud" numeric,
	"sucursales_longitud" numeric,
	"sucursales_observaciones" text,
	"sucursales_barrio" text,
	"sucursales_codigo_postal" text,
	"sucursales_localidad" text,
	"sucursales_provincia" text,
	"sucursales_lunes_horario_atencion" text,
	"sucursales_martes_horario_atencion" text,
	"sucursales_miercoles_horario_atencion" text,
	"sucursales_jueves_horario_atencion" text,
	"sucursales_viernes_horario_atencion" text,
	"sucursales_sabado_horario_atencion" text,
	"sucursales_domingo_horario_atencion" text,
	CONSTRAINT "sucursales_id_dataset_id_comercio_id_bandera_id_sucursal_key" UNIQUE("id_dataset","id_comercio","id_bandera","id_sucursal")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "precios" ADD CONSTRAINT "precios_id_dataset_datasets_id_fk" FOREIGN KEY ("id_dataset") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_id_dataset_datasets_id_fk" FOREIGN KEY ("id_dataset") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_precios_id_producto" ON "precios" USING btree ("id_producto");