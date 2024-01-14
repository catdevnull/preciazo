// @ts-check
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DB_PATH } from "./drizzle.config.js";
import { migrateDb } from "./migrate.js";
import * as schema from "./schema.js";

migrateDb();

export const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite, { schema });
