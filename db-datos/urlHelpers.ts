import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { productoUrls } from "./schema.js";

export function saveUrls(urls: string[]) {
  db.transaction((tx) => {
    const now = new Date();
    const insertUrlTra = tx
      .insert(productoUrls)
      .values({
        url: sql.placeholder("url"),
        firstSeen: now,
        lastSeen: now,
      })
      .onConflictDoUpdate({
        target: productoUrls.url,
        set: { lastSeen: now },
      })
      .prepare();

    for (const href of urls) {
      insertUrlTra.run({ url: href });
    }
  });
}
