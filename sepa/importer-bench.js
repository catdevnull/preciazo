// @ts-check
import { run, bench, boxplot } from "mitata";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { main } from "./importer.js";
import { rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
const execFileAsync = promisify(execFile);

async function fibonacci() {
  await main("samples");
}
bench("main", async function* () {
  await rm("importer.db", { force: true });
  await rm("importer.db.wal", { force: true });
  await execFileAsync("duckdb", [
    "importer.db",
    readFileSync("duckdb.sql", "utf8"),
  ]);
  yield () => fibonacci();
});

// await run();
await rm("importer.db", { force: true });
await rm("importer.db.wal", { force: true });
await execFileAsync("duckdb", [
  "importer.db",
  readFileSync("duckdb.sql", "utf8"),
]);
await fibonacci();
