// @ts-check
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {import("drizzle-orm/better-sqlite3").BetterSQLite3Database<schema>} db
 */
export function migrateDb(db) {
  let path = "drizzle/";
  if (!existsSync(join(path, "meta/_journal.json")))
    path = "node_modules/db-datos/drizzle";
  migrate(db, { migrationsFolder: path });
  db.run(sql`pragma journal_mode = WAL;`);
  db.run(sql`PRAGMA synchronous = NORMAL;`);
  db.run(sql`PRAGMA busy_timeout = 15000;`);
  db.run(sql`PRAGMA cache_size = 1000000000;`);
  // db.run(sql`PRAGMA foreign_keys = true;`);
  db.run(sql`PRAGMA temp_store = memory;`);
}
