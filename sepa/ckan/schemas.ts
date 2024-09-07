import { z } from "zod";

export const zResource = z.object({
  id: z.string(),
  revision_id: z.string(),
  size: z.number(),
  format: z.string(),
  created: z.coerce.date(),
  url: z.string(),
  modified: z.coerce.date().optional(),
  description: z.string(),
  name: z.string(),
});
export type Resource = z.infer<typeof zResource>;
export const zDatasetInfo = z.object({
  metadata_modified: z.coerce.date(),
  metadata_created: z.coerce.date(),
  resources: z.array(zResource),
});
export type DatasetInfo = z.infer<typeof zDatasetInfo>;
