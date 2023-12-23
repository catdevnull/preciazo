const crlf = "\r\n";
const crlfB = Buffer.from(crlf, "utf-8");
const crlfcrlf = crlf + crlf;
const crlfcrlfB = Buffer.from(crlfcrlf, "utf-8");
const warc10B = Buffer.from("WARC/1.0", "utf-8");
const emptyBuffer = Buffer.from("", "utf-8");

export async function* parseWARC(path: string) {
  const warc = Bun.spawn(["zstd", "-do", "/dev/stdout", path], {
    stderr: "ignore",
  }).stdout;

  // const warc = Bun.stdin.stream(1024 * 1024 * 128);

  // let buffer: Uint8Array[] = [];
  // const transform = new TransformStream<Uint8Array, Buffer>({
  //   transform(chunk, controller) {
  //     buffer.push(chunk);
  //     if (
  //       buffer.reduce((prev, curr) => prev + curr.length, 0) >
  //       1024 * 1024 * 64
  //     ) {
  //       controller.enqueue(Buffer.concat(buffer));
  //       buffer = [];
  //     }
  //   },
  //   flush(controller) {
  //     controller.enqueue(Buffer.concat(buffer));
  //   },
  // });

  // warc.pipeTo(transform.writable);

  const reader = warc.getReader();
  // const reader = transform.readable.getReader();

  // const warc = process.stdin;

  let arrays: Buffer[] = [];
  let done = false;
  while (!done) {
    const r = await reader.readMany();
    if (r.done) {
      done = true;
    } else {
      arrays = arrays.concat(r.value.map((x) => Buffer.from(x)));
      if (
        arrays.reduce((prev, curr) => prev + curr.length, 0) <
        1024 * 1024 * 10
      )
        continue;
    }
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
      let fields = new Map<string, string>();
      while (
        ((line = nextLine()),
        (field = parseField(line.toString("utf8"))),
        line.length !== 0)
      ) {
        fields.set(field[0], field[1]);
      }
      const length = parseInt(fields.get("Content-Length")!);

      const rawHttp = buf.subarray(
        until + crlfcrlfB.length,
        until + crlfcrlfB.length + length
      );
      const rawHttpHeaders = rawHttp
        .subarray(
          rawHttp.indexOf(crlfB) + crlfB.length,
          rawHttp.indexOf(crlfcrlfB) + crlfcrlfB.length
        )
        .toString();

      let httpHeaders = new Map<string, string>();
      rawHttpHeaders.split(crlf).forEach((line) => {
        if (!line.length) return;
        const [key, val] = line.split(": ");
        httpHeaders.set(key, val);
      });

      let content = rawHttp.subarray(
        rawHttp.indexOf(crlfcrlfB) + crlfcrlfB.length
      );

      if (httpHeaders.get("Transfer-Encoding") === "chunked") {
        content = dechunk(content);
      }

      //   console.debug(fields.get("WARC-Date"), content.length);

      yield {
        fields,
        content,
      };

      arrays = [
        buf.subarray(until + crlfcrlfB.length + length + crlfcrlfB.length),
      ];
      if (!arrays[0].length) break;
    }
  }
}

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

function dechunk(content: Buffer): Buffer {
  let actualContent = [];

  while (true) {
    let until = content.indexOf(crlf);
    const hexLen = content.subarray(0, until).toString();
    if (hexLen.length === 0) break;
    const len = parseInt(hexLen, 16);
    actualContent.push(
      content.subarray(until + crlfB.length, until + crlfB.length + len)
    );
    content = content.subarray(until + crlfB.length + len + crlfB.length);
  }

  return Buffer.concat(actualContent);
}
