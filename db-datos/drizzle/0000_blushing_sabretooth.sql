CREATE TABLE `precios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ean` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`precio_centavos` integer,
	`in_stock` integer,
	`url` text NOT NULL
);
