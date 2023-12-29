import Database from "bun:sqlite";
import { join, dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema.js";
import { DB_PATH } from "./drizzle.config.js";

const url = new URL(import.meta.url);
export function migrateDb() {
  const sqlite = new Database(DB_PATH);
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: join(dirname(url.pathname), "drizzle") });
  sqlite.run(`
pragma journal_mode = WAL;
PRAGMA synchronous = NORMAL;
`);

  sqlite.close();
}
