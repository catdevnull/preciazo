export const DB_PATH = process.env.DB_PATH ?? "../sqlite.db";

/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./schema.js",
  out: "./drizzle",
  driver: "better-sqlite",
  dbCredentials: {
    url: DB_PATH,
  },
};
