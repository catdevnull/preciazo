import type { PageServerLoad } from "./$types";
import { z } from "zod";
import ky from "ky";
import { API_HOST } from "$lib";

async function getInfo() {
  return z
    .object({
      count: z.number(),
    })
    .parse(await ky.get(`${API_HOST}/api/0/info`).json());
}

export const load: PageServerLoad = async () => {
  const nProductos = (await getInfo()).count;
  return { nProductos };
};
