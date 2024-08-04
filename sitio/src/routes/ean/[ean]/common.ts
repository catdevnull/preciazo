import { z } from "zod";

export const zPrecio = z.object({
  ean: z.string(),
  fetched_at: z.coerce.date(),
  precio_centavos: z.number().nullable(),
  in_stock: z.boolean().nullable(),
  url: z.string(),
  name: z.string().nullable(),
  image_url: z.string().nullable(),
});
export type Precio = z.infer<typeof zPrecio>;
