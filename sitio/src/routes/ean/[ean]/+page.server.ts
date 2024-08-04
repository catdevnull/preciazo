import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { z } from "zod";
import { zPrecio, type Precio } from "./common";
import { API_HOST } from "$lib";

async function getProductHistory(ean: string) {
  const res = await fetch(`${API_HOST}/api/0/ean/${ean}/history`);
  const json = await res.json();
  return z.array(zPrecio).parse(json);
}

export const load: PageServerLoad = async ({ params }) => {
  const res = await getProductHistory(params.ean);
  if (res.length === 0) return error(404, "Not Found");

  const meta = res.findLast(
    (p): p is Precio & { name: string; image_url: string } =>
      !!(p.name && p.image_url),
  );

  return { precios: res, meta };
};
