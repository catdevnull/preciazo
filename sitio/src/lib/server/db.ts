import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "db-datos/schema.js";
import { env } from "$env/dynamic/private";

const sqlite = new Database(env.DB_PATH ?? "../scraper/sqlite.db");
const db = drizzle(sqlite, { schema });

export { db };
export * as schema from "db-datos/schema.js";
