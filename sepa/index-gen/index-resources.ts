import { zDatasetInfo, type DatasetInfo, type Resource } from "../ckan/schemas";
import { getFileContent, listDirectory } from "./b2";

import { basename } from "path";

export async function indexResources() {
  const fileNames = await listDirectory("timestamped-metadata");

  let datasetInfos = new Map<string, Map<string, Resource>>();

  await Promise.all(
    fileNames.map(async (fileName) => {
      let resources = new Map<string, Resource>();

      const fileContentText = await getFileContent(fileName);
      const json = JSON.parse(fileContentText);
      if (!json.success) {
        console.log(`skipping ${fileName} because of ${json.error.message}`);
        return;
      }
      let datasetInfo: DatasetInfo;
      try {
        datasetInfo = zDatasetInfo.parse(json.result);
      } catch (e) {
        console.log(fileName, e);
        throw e;
      }

      for (const resource of datasetInfo.resources) {
        const id = `${resource.id}-${resource.revision_id}`;
        const existingResource = resources.get(id);
        if (
          existingResource &&
          existingResource.modified &&
          existingResource.modified > (resource.modified ?? 0)
        ) {
          continue;
        }
        resources.set(id, resource);
      }
      const base = basename(fileName, ".json");
      datasetInfos.set(base, resources);
    })
  );

  return Array.from(datasetInfos.entries()).reduce(
    (acc, [fileName, resources]) => {
      acc[fileName] = Array.from(resources.values());
      return acc;
    },
    {} as Record<string, Resource[]>
  );
}
