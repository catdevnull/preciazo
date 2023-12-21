import { readFile, writeFile } from "fs/promises";
import pMap from "p-map";
import { nanoid } from "nanoid";
import { getHtml } from "./fetch.js";
import { join } from "path";

(async () => {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error("falta input y/o output");
    process.exit(1);
  }
  const file = await readFile(inputPath, "utf-8");
  const urls = file.split("\n");

  await pMap(
    urls,
    async (url: string) => {
      const id = nanoid();
      const html = await getHtml(url);
      await writeFile(join(outputPath, `${id}.link`), url);
      await writeFile(join(outputPath, id), html);
    },
    { concurrency: 12 }
  );
})();
