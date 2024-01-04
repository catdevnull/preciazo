import pMap from "p-map";
import { saveUrls } from "db-datos/urlHelpers.js";
import { getUrlsFromSitemap } from "./common.js";

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
      saveUrls(getUrlsFromSitemap(xml));
    },
    { concurrency: 3 }
  );
}
