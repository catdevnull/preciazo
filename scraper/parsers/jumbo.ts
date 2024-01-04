import { parseHTML } from "linkedom";
import { type Precioish } from "../scrap.js";
import { getProductJsonLd, priceFromMeta, stockFromMeta } from "./common.js";
import { z } from "zod";

const zJumboSearch = z.tuple([
  z.object({
    items: z.array(
      z.object({
        ean: z.string(),
      })
    ),
  }),
]);

async function getEanFromSearch(sku: string) {
  const url = new URL(
    "https://www.jumbo.com.ar/api/catalog_system/pub/products/search"
  );
  url.searchParams.set("fq", `skuId:${sku}`);
  const res = await fetch(url);
  const json = await res.json();
  const parsed = zJumboSearch.parse(json);
  const ean = parsed[0].items[0].ean;
  if (!parsed[0].items.every((x) => x.ean === ean)) {
    throw new Error("Inesperado: no todos los items tienen el mismo EAN");
  }
  return ean;
}

export async function getJumboProduct(
  html: string | Buffer
): Promise<Precioish> {
  const dom = parseHTML(html);
  const precioCentavos = priceFromMeta(dom);
  const inStock = stockFromMeta(dom);

  const ld = getProductJsonLd(dom);
  const name = ld.name;
  const imageUrl = ld.image;

  const retailerSku = ld.sku;
  if (!retailerSku)
    throw new Error("No encontré el SKU de Jumbo para pedir el EAN");
  const ean = await getEanFromSearch(retailerSku);

  return {
    name,
    imageUrl,
    ean,
    precioCentavos,
    inStock,
  };
}
