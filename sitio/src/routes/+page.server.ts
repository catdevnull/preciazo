import type { PageServerLoad } from "./$types";
import z from "zod";

async function getBestSelling() {
  const res = await fetch(
    `${import.meta.env.VITE_API_HOST}/api/0/best-selling-products`,
  );
  const json = await res.json();
  return z
    .array(
      z.object({
        category: z.string(),
        products: z.array(
          z.object({
            ean: z.string(),
            name: z.string().nullable(),
            image_url: z.string().nullable(),
          }),
        ),
      }),
    )
    .parse(json);
}

export const load: PageServerLoad = async ({ params }) => {
  return {
    data: await getBestSelling(),
  };
};
