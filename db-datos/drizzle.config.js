export const DB_PATH = process.env.DB_PATH ?? "../db.db";

/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./schema.js",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: DB_PATH,
  },
};
