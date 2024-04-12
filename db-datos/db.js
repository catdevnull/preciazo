// @ts-check
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DB_PATH } from "./drizzle.config.js";
import * as schema from "./schema.js";
import { migrateDb } from "./migrate.js";

/** @type {null | import("drizzle-orm/better-sqlite3").BetterSQLite3Database<schema>} */
let db = null;
export function getDb() {
  if (db) return db;
  const sqlite = new Database(DB_PATH);
  sqlite.exec(`PRAGMA journal_mode = WAL;`);
  sqlite.exec(`PRAGMA busy_timeout = 15000;`);
  sqlite.exec(`PRAGMA synchronous = NORMAL;`);
  sqlite.exec(`PRAGMA cache_size = 1000000000;`);
  sqlite.exec(`PRAGMA foreign_keys = true;`);
  sqlite.exec(`PRAGMA temp_store = memory;`);
  db = drizzle(sqlite, { schema, logger: true });
  migrateDb(db);
  return db;
}
