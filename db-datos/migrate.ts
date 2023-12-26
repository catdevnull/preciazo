import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema.js";
import { DB_PATH } from "./drizzle.config.js";

export function migrateDb() {
  const sqlite = new Database(DB_PATH);
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: "./drizzle" });
  sqlite.run(`
pragma journal_mode = WAL;
PRAGMA synchronous = NORMAL;
`);

  sqlite.close();
}
