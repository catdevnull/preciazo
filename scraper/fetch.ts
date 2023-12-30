export async function getHtml(url: string) {
  const res = await fetch(url);
  return readableToBuffer(res.body!);
}

async function readableToBuffer(source: AsyncIterable<any>) {
  // https://stackoverflow.com/a/72891118
  const buffers = [];
  for await (const data of source) {
    buffers.push(data);
  }
  return Buffer.concat(buffers);
}
