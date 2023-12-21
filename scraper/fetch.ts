import { request } from "undici";
import { createBrotliDecompress, createUnzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

export async function getHtml(url: string) {
  const res = await request(url, {
    headers: {},
  });
  let output: Buffer;
  switch (res.headers["content-encoding"]) {
    case "gzip":
    case "deflate":
      output = await pipeline(res.body, createUnzip(), readableToBuffer);
      break;
    case "br":
      output = await pipeline(
        res.body,
        createBrotliDecompress(),
        readableToBuffer
      );
      break;
    default:
      output = await readableToBuffer(res.body);
  }
  return output;
}

async function readableToBuffer(source: AsyncIterable<any>) {
  // https://stackoverflow.com/a/72891118
  const buffers = [];
  for await (const data of source) {
    buffers.push(data);
  }
  return Buffer.concat(buffers);
}
