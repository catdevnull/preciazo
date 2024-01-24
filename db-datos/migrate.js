// @ts-check
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { sql } from "drizzle-orm";

/**
 * @param {import("drizzle-orm/better-sqlite3").BetterSQLite3Database<schema>} db
 */
export function migrateDb(db) {
  migrate(db, { migrationsFolder: "node_modules/db-datos/drizzle" });
  db.run(sql`pragma journal_mode = WAL;`);
  db.run(sql`PRAGMA synchronous = NORMAL;`);
}
