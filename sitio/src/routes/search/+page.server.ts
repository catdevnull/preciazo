import { z } from "zod";
import type { PageServerLoad } from "./$types";
import { API_HOST } from "$lib";
import ky from "ky";

const zProductResult = z.object({
  ean: z.string(),
  name: z.string(),
  image_url: z.string(),
});

async function search(query: string) {
  return z
    .array(zProductResult)
    .parse(
      await ky
        .get(`${API_HOST}/api/0/search/${encodeURIComponent(query)}`)
        .json(),
    );
}

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get("q");
  let results: null | { ean: string; name: string; image_url: string }[] = query
    ? await search(query)
    : null;

  return { query, results };
};
