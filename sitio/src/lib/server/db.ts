export { db } from "db-datos/db.js";
export * as schema from "db-datos/schema.js";
import { migrateDb } from "db-datos/migrate.js";
migrateDb();
