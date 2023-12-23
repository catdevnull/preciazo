import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const sqlite = new Database("../scraper/sqlite.db");
const db = drizzle(sqlite, { schema });

await migrate(db, { migrationsFolder: "./drizzle" });

sqlite.close();
