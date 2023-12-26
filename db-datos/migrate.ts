import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema.js";
import { DB_PATH } from "./drizzle.config.js";

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: "./drizzle" });

sqlite.close();
