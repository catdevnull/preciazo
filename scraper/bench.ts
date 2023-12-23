// import { run, bench, group, baseline } from "mitata";
import { createReadStream } from "node:fs";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getCarrefourProduct } from "./carrefour.js";
import { WARCParser } from "warcio";
// import { ZSTDDecompress } from "simple-zstd";
// import { AutoWARCParser } from "node-warc";

// const html = await readFile("carrefour.html", "utf-8");
// bench("carrefour", () => {
//   getCarrefourProduct(html);
// });

// await bench("warcio", async () => {
//   const warc = Bun.spawn(
//     ["zstd", "-do", "/dev/stdout", "../data/carrefour.warc.zst"],
//     {
//       // stdin: Bun.file().stream(),
//     }
//   ).stdout;
//   // const warc = Bun.file("../data/carrefour.warc").stream(1024 * 1024 * 512);
//   // const warc = createReadStream("../data/carrefour.warc.zst").pipe(ZSTDDecompress());

//   const parser = new WARCParser(warc);
//   for await (const record of parser) {
//     const html = await record.contentText();
//   }
// });

// await bench("warc", );

async function bench(name: string, func: () => Promise<void>) {
  const t0 = performance.now();
  await func();
  const t1 = performance.now();
  console.debug(`${name} took ${t1 - t0}`);
}

// await run({});
