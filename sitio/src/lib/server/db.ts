import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "db-datos/schema.js";
import { migrateDb } from "db-datos/migrate.js";
import { env } from "$env/dynamic/private";

migrateDb();

const sqlite = new Database(env.DB_PATH ?? "../scraper/sqlite.db");

export const db = drizzle(sqlite, { schema });
export * as schema from "db-datos/schema.js";
