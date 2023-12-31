import { parseHTML } from "linkedom";
import { type Precioish } from "../scrap.js";

function getEanFromText({ document }: Window) {
  const potentialEanEls = Array.from(
    document.querySelectorAll("div#brandText")
  );
  const eanParent = potentialEanEls.find(
    (el) => el.textContent?.includes("| EAN: ")
  );
  if (!eanParent) throw new Error("no encuentro el eanparent");

  const eanEl = Array.from(
    eanParent?.querySelectorAll("span.span_codigoplu")
  )[1];
  const ean = eanEl?.textContent?.trim();
  if (!ean) throw new Error("no encuentro el ean");
  return ean;
}
function getPriceFromText({ document }: Window) {
  const el = document.querySelector(".atg_store_newPrice");
  if (!el?.textContent) return null;
  const nStr = el.textContent
    .trim()
    .replace("$", "")
    .replaceAll(".", "")
    .replace(",", ".");
  return parseFloat(nStr) * 100;
}
function getInStock({ document }: Window) {
  return !document.querySelector(".product_not_available");
}

export function getCotoProduct(html: string | Buffer): Precioish {
  const dom = parseHTML(html);

  const ean = getEanFromText(dom);
  const precioCentavos = getPriceFromText(dom);
  const inStock = getInStock(dom);

  const name = dom.document
    .querySelector("h1.product_page")
    ?.textContent?.trim();
  const imageUrl =
    dom.document.querySelector<HTMLImageElement>(".zoom img")?.src;

  return { name, imageUrl, ean, precioCentavos, inStock };
}
