CREATE TABLE `db_best_selling` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fetched_at` integer NOT NULL,
	`category` text NOT NULL,
	`eans_json` text NOT NULL
);
