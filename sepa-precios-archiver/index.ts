import { z } from "zod";
import { zDatasetInfo } from "./schemas";
import { mkdtemp, writeFile } from "fs/promises";
import { $ } from "bun";

const dir = await mkdtemp("/tmp/sepa-precios-archiver-");

await $`git clone https://catdevnull:${process.env.GITHUB_TOKEN}@github.com/catdevnull/sepa-precios-metadata.git ${dir}`;

async function getRawDatasetInfo() {
  const response = await fetch(
    "https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios",
  );
  const json = await response.json();
  return json;
}

const rawDatasetInfo = await getRawDatasetInfo();
const datasetInfo = z.object({ result: zDatasetInfo }).parse(rawDatasetInfo);

await writeFile(
  dir + "/dataset-info.json",
  JSON.stringify(rawDatasetInfo, null, 2),
);

await $`cd ${dir} && git add dataset-info.json`;
await $`cd ${dir} && git diff --staged --quiet || git commit -m "Update dataset info"`;
await $`cd ${dir} && git push origin main`;
