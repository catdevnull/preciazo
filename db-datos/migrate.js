// @ts-check
import Database from "better-sqlite3";
import { join, dirname } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { DB_PATH } from "./drizzle.config.js";

const url = new URL(import.meta.url);
export function migrateDb() {
  const sqlite = new Database(DB_PATH);
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: join(dirname(url.pathname), "drizzle") });
  sqlite.exec(`
pragma journal_mode = WAL;
PRAGMA synchronous = NORMAL;
`);

  sqlite.close();
}
