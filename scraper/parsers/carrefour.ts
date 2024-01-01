import { parseHTML } from "linkedom";
import { Precioish } from "../scrap.js";
import { getProductJsonLd, priceFromMeta, stockFromMeta } from "../common.js";

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

export function getCarrefourProduct(html: string | Buffer): Precioish {
  const dom = parseHTML(html);

  const precioCentavos = priceFromMeta(dom);
  const inStock = stockFromMeta(dom);

  const ean = eanFromSeedState(dom);

  let name, imageUrl;
  try {
    const ld = getProductJsonLd(dom);
    name = ld.name;
    imageUrl = ld.image;
  } catch (error) {
    if (inStock) {
      throw error;
    } else {
      // algunas paginas sin stock no tienen json ld
    }
  }

  return {
    name,
    imageUrl,
    ean,
    precioCentavos,
    inStock,
  };
}
