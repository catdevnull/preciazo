import PQueue from "p-queue";
import { IndexEntry, IndexJson } from "../index-gen";
import { $ } from "bun";
import { existsSync } from "fs";

async function getIndex() {
  const res = await fetch(
    "https://raw.githubusercontent.com/catdevnull/sepa-precios-metadata/main/index.json"
  );
  return IndexJson.parse(await res.json());
}

const index = await getIndex();

const latestResources = Object.values(index)
  .filter((a) => a.length > 0)
  .map(
    (a) =>
      a
        .filter(
          (r): r is IndexEntry & { link: string } => !!(!r.warnings && r.link)
        )
        .sort((a, b) => +b.firstSeenAt - +a.firstSeenAt)[0]
  );

const queue = new PQueue({ concurrency: 10 });

for (const resource of latestResources) {
  queue.add(async () => {
    const filename = resource.link.split("/").pop()!;
    if (existsSync(filename)) return;
    await $`curl ${resource.link} -o ${filename}.temp`;
    await $`mv ${filename}.temp ${filename}`;
  });
}
