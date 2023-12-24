import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema.js";

const sqlite = new Database("../scraper/sqlite.db");
const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: "./drizzle" });

sqlite.close();
