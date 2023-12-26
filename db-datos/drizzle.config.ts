import type { Config } from "drizzle-kit";

if (!process.env.DB_PATH) throw new Error("no hay DB_PATH");

export const DB_PATH = process.env.DB_PATH;

export default {
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DB_PATH,
  },
} satisfies Config;
