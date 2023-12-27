import type { Config } from "drizzle-kit";

export const DB_PATH = process.env.DB_PATH ?? "../scraper/sqlite.db";

export default {
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DB_PATH,
  },
} satisfies Config;
