import { getHtml } from "../scraper/fetch.js";
import { parseHTML } from "linkedom";
import PQueue from "p-queue";

// let fetched = new Set<string>();
{
  const initial =
    "https://www.cotodigital3.com.ar/sitios/cdigi/browse?Nf=product.endDate%7CGTEQ+1.7032032E12%7C%7Cproduct.startDate%7CLTEQ+1.7032032E12&No=2200&Nr=AND%28product.sDisp_200%3A1004%2Cproduct.language%3Aespa%C3%B1ol%2COR%28product.siteId%3ACotoDigital%29%29&Nrpp=200";

  const queue = new PQueue({ concurrency: 2 });

  const pageSize = 300; // hasta 1000
  const links = Array.from({ length: Math.ceil(29000 / 300) }, (x, i) => i).map(
    (i) => {
      const url = new URL(initial);
      url.searchParams.set("No", `${i * pageSize}`);
      url.searchParams.set("Nrpp", `${pageSize}`);
      return url.toString();
    }
  );

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
    hrefs.forEach((h) => process.stdout.write(h + "\n"));

    // const nextLinks = Array.from(
    //   document.querySelectorAll<HTMLAnchorElement>(
    //     "#atg_store_pagination a[href]"
    //   ),
    //   (a) => new URL(a.href, url).toString()
    // );

    // await Promise.all(
    //   nextLinks
    //     .filter((l) => !fetched.has(l))
    //     .map((l) => {
    //       fetched.add(l);
    //       return queue.add(getPage(l));
    //     })
    // );
  };
}
