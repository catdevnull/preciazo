DROP INDEX IF EXISTS "idx_precios_id_dataset_id_comercio_id_sucursal";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_precios_id_producto_id_comercio_id_sucursal" ON "precios" USING btree ("id_producto","id_comercio","id_sucursal");