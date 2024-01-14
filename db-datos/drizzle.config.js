export const DB_PATH = process.env.DB_PATH ?? "../scraper/sqlite.db";

/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DB_PATH,
  },
};
