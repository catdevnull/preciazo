import pMap from "p-map";
import { saveUrls } from "db-datos/urlHelpers.js";
import { getUrlsFromSitemap } from "./common.js";

export async function scrapJumboProducts() {
  await scrapBySitemap();
}

async function scrapBySitemap() {
  // de https://www.jumbo.com.ar/sitemap.xml
  const sitemaps = [
    "https://www.jumbo.com.ar/sitemap/product-1.xml",
    "https://www.jumbo.com.ar/sitemap/product-10.xml",
    "https://www.jumbo.com.ar/sitemap/product-11.xml",
    "https://www.jumbo.com.ar/sitemap/product-12.xml",
    "https://www.jumbo.com.ar/sitemap/product-13.xml",
    "https://www.jumbo.com.ar/sitemap/product-14.xml",
    "https://www.jumbo.com.ar/sitemap/product-15.xml",
    "https://www.jumbo.com.ar/sitemap/product-2.xml",
    "https://www.jumbo.com.ar/sitemap/product-3.xml",
    "https://www.jumbo.com.ar/sitemap/product-4.xml",
    "https://www.jumbo.com.ar/sitemap/product-5.xml",
    "https://www.jumbo.com.ar/sitemap/product-6.xml",
    "https://www.jumbo.com.ar/sitemap/product-7.xml",
    "https://www.jumbo.com.ar/sitemap/product-8.xml",
    "https://www.jumbo.com.ar/sitemap/product-9.xml",
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
