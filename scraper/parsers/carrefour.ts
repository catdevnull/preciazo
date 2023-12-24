import { parseHTML } from "linkedom";
import { Precioish, type Precio } from "../scrap.js";
import { getProductJsonLd, priceFromMeta } from "../common.js";

function getEanByTable(dom: Window): string {
  const eanLabelEl = dom.window.document.querySelector(
    'td[data-specification="EAN"]'
  );
  const eanValueEl = eanLabelEl?.parentElement?.children[1];
  if (
    !eanValueEl ||
    !(eanValueEl instanceof dom.window.HTMLElement) ||
    !eanValueEl.dataset.specification
  )
    throw new Error("No encontré el EAN");
  return eanValueEl.dataset.specification;
}
function parseScriptJson<T>(dom: Window, varname: string): T {
  const script = dom.window.document.querySelector<HTMLTemplateElement>(
    `template[data-type="json"][data-varname="${varname}"]`
  )?.content?.children[0];
  if (!script) throw new Error("no encuentro el script");
  return JSON.parse(script.innerHTML);
}
function eanFromSeedState(dom: Window): string {
  const json = parseScriptJson<object>(dom, "__STATE__");
  const productJson = Object.entries(json).find(
    ([key, val]) => key.startsWith("Product:") && val.__typename === "Product"
  );
  if (!productJson) throw new Error("no encontré el product en el json");

  const productSkuJson = Object.entries(json).find(
    ([key, val]) =>
      key.startsWith(`Product:${productJson[1].cacheId}`) &&
      val.__typename === "SKU"
  );
  if (!productSkuJson) throw new Error("no encontré el sku en el json");
  return productSkuJson[1].ean;
}
function eanFromDynamicYieldScript(dom: Window): string {
  const scriptEl = dom.window.document.querySelector(
    `script[src^="//st.dynamicyield.com/st?"]`
  );
  if (!scriptEl || !(scriptEl instanceof dom.window.HTMLScriptElement))
    throw new Error("no encuentro el script de dynamicyield");

  const url = new URL(scriptEl.src);
  const ctx = url.searchParams.get("ctx");
  if (!ctx) throw new Error("no hay ctx");
  return JSON.parse(ctx).data[0];
}

export function getCarrefourProduct(html: string | Buffer): Precioish {
  const dom = parseHTML(html);

  const precioCentavos = priceFromMeta(dom);

  // const productLd = findJsonLd(dom, "Product");
  const ean = eanFromSeedState(dom);

  const ld = getProductJsonLd(dom);
  const inStock =
    ld.offers.offers[0].availability === "http://schema.org/InStock";

  return {
    ean,
    precioCentavos,
    inStock,
  };
}
