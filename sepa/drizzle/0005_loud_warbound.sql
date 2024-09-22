CREATE TABLE IF NOT EXISTS "banderas" (
	"id_dataset" integer,
	"id_comercio" integer NOT NULL,
	"id_bandera" integer NOT NULL,
	"comercio_cuit" text NOT NULL,
	"comercio_razon_social" text,
	"comercio_bandera_nombre" text,
	"comercio_bandera_url" text,
	"comercio_ultima_actualizacion" date,
	"comercio_version_sepa" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "banderas" ADD CONSTRAINT "banderas_id_dataset_datasets_id_fk" FOREIGN KEY ("id_dataset") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
