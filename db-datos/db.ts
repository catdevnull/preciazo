import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { DB_PATH } from "./drizzle.config.js";
import { migrateDb } from "./migrate.js";
import * as schema from "./schema.js";

migrateDb();

export const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite, { schema });
