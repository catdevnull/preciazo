import { getHtml } from "../scraper/fetch.js";
import { parseHTML } from "linkedom";
import PQueue from "p-queue";
import { saveUrls } from "db-datos/urlHelpers.js";

export async function scrapCotoProducts() {
  const initial =
    "https://www.cotodigital3.com.ar/sitios/cdigi/browse?Nf=product.endDate%7CGTEQ+1.7032032E12%7C%7Cproduct.startDate%7CLTEQ+1.7032032E12&No=2200&Nr=AND%28product.sDisp_200%3A1004%2Cproduct.language%3Aespa%C3%B1ol%2COR%28product.siteId%3ACotoDigital%29%29&Nrpp=200";

  const queue = new PQueue({ concurrency: 4 });

  const pageSize = 300; // hasta 1000
  const links = Array.from(
    { length: Math.ceil(29000 / pageSize) },
    (x, i) => i
  ).map((i) => {
    const url = new URL(initial);
    url.searchParams.set("No", `${i * pageSize}`);
    url.searchParams.set("Nrpp", `${pageSize}`);
    return url.toString();
  });

  const promises = links.map((l) => queue.add(getPage(l)));
  await Promise.all(promises);
}

function getPage(url: string) {
  return async () => {
    let html;
    try {
      html = await getHtml(url);
    } catch (error) {
      await getPage(url)();
      return;
    }
    const { document } = parseHTML(html.toString("utf-8"));

    const hrefs = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(".product_info_container a"),
      (a) => new URL(a.href, url).toString()
    );
    saveUrls(hrefs);
  };
}
