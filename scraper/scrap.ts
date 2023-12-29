import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "db-datos/schema.js";
import { WARCParser } from "warcio";
import { writeFile } from "fs/promises";
import { createHash } from "crypto";
import { getCarrefourProduct } from "./parsers/carrefour.js";
import { getDiaProduct } from "./parsers/dia.js";
import { getCotoProduct } from "./parsers/coto.js";
import { join } from "path";
import { and, eq, sql } from "drizzle-orm";
import { DB_PATH } from "db-datos/drizzle.config.js";
import { migrateDb } from "db-datos/migrate.js";

const DEBUG = false;
const PARSER_VERSION = 3;

migrateDb();

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

const getPrevPrecio = db
  .select({ id: schema.precios.id })
  .from(schema.precios)
  .where(
    and(
      eq(schema.precios.warcRecordId, sql.placeholder("warcRecordId")),
      eq(schema.precios.parserVersion, PARSER_VERSION)
    )
  )
  .limit(1)
  .prepare();

export type Precio = typeof schema.precios.$inferInsert;
export type Precioish = Omit<
  Precio,
  "fetchedAt" | "url" | "id" | "warcRecordId" | "parserVersion"
>;

export async function parseWarc(path: string) {
  // const warc = createReadStream(path);
  let progress: {
    done: number;
    errors: { error: any; warcRecordId: string; path: string }[];
  } = { done: 0, errors: [] };

  const warc = Bun.spawn(["zstd", "-do", "/dev/stdout", path], {
    stderr: "ignore",
  }).stdout;
  // TODO: tirar error si falla zstd

  const parser = new WARCParser(warc);
  for await (const record of parser) {
    if (record.warcType === "response") {
      if (!record.warcTargetURI) continue;
      const warcRecordId = record.warcHeader("WARC-Record-ID");
      if (!warcRecordId) throw new Error("No tiene WARC-Record-ID");

      if (getPrevPrecio.get({ warcRecordId })) {
        console.debug(`skipped ${warcRecordId}`);
        continue;
      }
      // TODO: sobreescribir si existe el mismo record-id pero con version mas bajo?

      const html = await record.contentText();

      const url = new URL(record.warcTargetURI);
      try {
        let ish: Precioish | undefined = undefined;
        if (url.hostname === "www.carrefour.com.ar")
          ish = getCarrefourProduct(html);
        else if (url.hostname === "diaonline.supermercadosdia.com.ar")
          ish = getDiaProduct(html);
        else if (url.hostname === "www.cotodigital3.com.ar")
          ish = getCotoProduct(html);
        else throw new Error(`Unknown host ${url.hostname}`);

        const p: Precio = {
          ...ish,
          fetchedAt: new Date(record.warcDate!),
          url: record.warcTargetURI,
          warcRecordId,
          parserVersion: PARSER_VERSION,
        };

        await db.insert(schema.precios).values(p);

        progress.done++;
      } catch (error) {
        console.error({ path, warcRecordId, error });
        progress.errors.push({
          path,
          warcRecordId,
          error,
        });

        if (DEBUG) {
          const urlHash = createHash("md5")
            .update(record.warcTargetURI!)
            .digest("hex");
          const output = join("debug", `${urlHash}.html`);
          await writeFile(output, html);
          console.error(`wrote html to ${output}`);
        }
      }
    }
  }

  return progress;
}
