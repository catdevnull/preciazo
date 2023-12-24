import { parseHTML } from "linkedom";
import { type Precioish } from "../scrap.js";
import { getMetaProp, getProductJsonLd, priceFromMeta } from "../common.js";

export function getDiaProduct(html: string | Buffer): Precioish {
  const dom = parseHTML(html);

  const ean = getMetaProp(dom, "product:retailer_item_id");
  if (!ean) throw new Error("No encontré el ean");
  const precioCentavos = priceFromMeta(dom);

  const ld = getProductJsonLd(dom);
  const name = ld.name;
  const imageUrl = ld.image;
  const inStock =
    ld.offers.offers[0].availability === "http://schema.org/InStock";

  return {
    name,
    imageUrl,
    ean,
    precioCentavos,
    inStock,
  };
}
