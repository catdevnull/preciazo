import pMap from "p-map";
import { decodeXML } from "entities";
import { saveUrls } from "db-datos/urlHelpers.js";

export async function scrapCarrefourProducts() {
  await scrapBySitemap();
}

async function scrapBySitemap() {
  // de https://www.carrefour.com.ar/sitemap.xml
  const sitemaps = [
    "https://www.carrefour.com.ar/sitemap/product-0.xml",
    "https://www.carrefour.com.ar/sitemap/product-1.xml",
    "https://www.carrefour.com.ar/sitemap/product-2.xml",
    "https://www.carrefour.com.ar/sitemap/product-3.xml",
    "https://www.carrefour.com.ar/sitemap/product-4.xml",
    "https://www.carrefour.com.ar/sitemap/product-5.xml",
    "https://www.carrefour.com.ar/sitemap/product-6.xml",
    "https://www.carrefour.com.ar/sitemap/product-7.xml",
    "https://www.carrefour.com.ar/sitemap/product-8.xml",
    "https://www.carrefour.com.ar/sitemap/product-9.xml",
  ];

  await pMap(
    sitemaps,
    async (sitemapUrl) => {
      const res = await fetch(sitemapUrl);
      const xml = await res.text();
      let urls = new Set<string>();
      new HTMLRewriter()
        .on("loc", {
          text(element) {
            const txt = element.text.trim();
            if (!txt) return;
            urls.add(decodeXML(txt));
          },
        })
        .transform(new Response(xml));
      saveUrls(Array.from(urls));
    },
    { concurrency: 3 }
  );
}
