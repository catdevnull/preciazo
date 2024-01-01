import { z } from "zod";

export function getMetaProp(dom: Window, prop: string) {
  return dom.window.document
    .querySelector(`meta[property="${prop}"]`)
    ?.getAttribute("content");
}

export function priceFromMeta(dom: Window) {
  const precioMeta = getMetaProp(dom, "product:price:amount");
  if (!precioMeta) return null;
  const precioCentavos = parseFloat(precioMeta) * 100;
  return precioCentavos;
}
export function stockFromMeta(dom: Window) {
  const stockMeta = getMetaProp(dom, "product:availability");
  return stockMeta === "instock";
}

function parseJsonLds(dom: Window): object[] {
  const scripts = dom.window.document.querySelectorAll(
    'script[type="application/ld+json"]'
  );
  return [...scripts].map((scripts) => JSON.parse(scripts.innerHTML));
}
function findJsonLd(dom: Window, type: string): object | undefined {
  return parseJsonLds(dom).find((x) => "@type" in x && x["@type"] === type);
}

const zProductLd = z.object({
  "@type": z.literal("Product"),
  name: z.string(),
  image: z.string(),
  offers: z.object({
    offers: z.tuple([
      z.object({
        "@type": z.literal("Offer"),
        price: z.number(),
        priceCurrency: z.literal("ARS"),
        availability: z.enum([
          "http://schema.org/OutOfStock",
          "http://schema.org/InStock",
        ]),
      }),
    ]),
  }),
});
type ProductLd = z.infer<typeof zProductLd>;

export function getProductJsonLd(dom: Window): ProductLd {
  const ld = findJsonLd(dom, "Product");
  const productLd = zProductLd.parse(ld);
  return productLd;
}
