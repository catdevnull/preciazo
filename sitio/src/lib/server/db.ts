import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "db-datos/schema.js";
import { env } from "$env/dynamic/private";

const sqlite = new Database(env.DB_PATH ?? "../scraper/sqlite.db");

export const db = drizzle(sqlite, { schema });
export * as schema from "db-datos/schema.js";
