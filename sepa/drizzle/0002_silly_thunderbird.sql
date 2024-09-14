ALTER TABLE "datasets" ADD COLUMN "id_comercio" integer;
--> statement-breakpoint
UPDATE "datasets"
SET "id_comercio" = CAST(SUBSTRING("name" FROM 'comercio-sepa-(\d+)') AS integer)
WHERE "name" ~ 'comercio-sepa-\d+';