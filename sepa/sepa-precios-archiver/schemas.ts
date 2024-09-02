import { z } from "zod";

export const zDatasetInfo = z.object({
  metadata_modified: z.coerce.date(),
  metadata_created: z.coerce.date(),
  resources: z.array(
    z.object({
      id: z.string(),
      size: z.number(),
      format: z.string(),
      created: z.coerce.date(),
      url: z.string(),
      modified: z.coerce.date().optional(),
      description: z.string(),
    }),
  ),
});
