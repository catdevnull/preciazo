// import { run, bench, group, baseline } from "mitata";
import { createReadStream } from "node:fs";
import { Readable } from "stream";
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

const crlf = "\r\n";
const crlfB = Buffer.from(crlf, "utf-8");
const crlfcrlf = crlf + crlf;
const crlfcrlfB = Buffer.from(crlfcrlf, "utf-8");
const warc10B = Buffer.from("WARC/1.0", "utf-8");
const emptyBuffer = Buffer.from("", "utf-8");

await bench("warc", async () => {
  // const warc = Bun.spawn(
  //   ["zstd", "-do", "/dev/stdout", "../data/carrefour.warc.zst"],
  //   {
  //     stderr: "ignore",
  //   }
  // ).stdout;

  const warc = Bun.stdin.stream();
  // const warc = Readable.toWeb(process.stdin);

  let buffer: Uint8Array[] = [];
  const transform = new TransformStream<Uint8Array, Buffer>({
    transform(chunk, controller) {
      buffer.push(chunk);
      if (buffer.reduce((prev, curr) => prev + curr.length, 0) > 1024 * 1024) {
        controller.enqueue(Buffer.concat(buffer));
        buffer = [];
      }
    },
    flush(controller) {
      controller.enqueue(Buffer.concat(buffer));
    },
  });

  warc.pipeTo(transform.writable);

  let arrays: Buffer[] = [];
  let n = 0;
  for await (const chunk of transform.readable) {
    console.debug(n);
    // console.debug(chunk.length);
    const b = Buffer.from(chunk);
    arrays.push(b);
    // if (
    //   arrays.reduce((prev, curr) => prev + curr.length, 0) <
    //   1024 * 1024 * 1024
    // )
    //   continue;
    let buf: Buffer;
    while (
      ((buf = arrays.length === 1 ? arrays[0] : Buffer.concat(arrays)),
      buf.subarray(warc10B.length).includes(warc10B))
    ) {
      const until = buf.indexOf(crlfcrlfB);
      const header = buf.subarray(0, until);

      const lines = splitBuffer(header, crlfB);
      let i = 0;
      const nextLine = () => {
        const line = lines[i];
        i++;
        return line ? line : emptyBuffer;
      };
      let line: Buffer;
      if (!(line = nextLine()).equals(warc10B)) {
        throw new Error(`No WARC 1.0 header in '${line}'`);
      }

      let field;
      let fields = new Map();
      while (
        ((line = nextLine()),
        (field = parseField(line.toString("utf8"))),
        line.length !== 0)
      ) {
        fields.set(field[0], field[1]);
      }
      const length = parseInt(fields.get("Content-Length"));
      const content = buf.subarray(0, length);
      // console.debug(fields.get("WARC-Date"), content.length);
      n++;
      arrays = [
        buf.subarray(until + crlfcrlfB.length + length + crlfcrlfB.length),
      ];
    }
  }
});

function splitBuffer(buffer: Buffer, val: Buffer): Buffer[] {
  let bufs = [];
  let rest = buffer;
  let i;
  while (((i = rest.indexOf(val)), i !== -1)) {
    bufs.push(rest.subarray(0, i));
    rest = rest.subarray(i + val.length);
  }
  bufs.push(rest);
  return bufs;
}

function parseField(line: string): [string, string] {
  const [key, val] = line.split(": ");
  return [key, val];
}

async function bench(name: string, func: () => Promise<void>) {
  const t0 = performance.now();
  await func();
  const t1 = performance.now();
  console.debug(`${name} took ${t1 - t0}`);
}

// await run({});
