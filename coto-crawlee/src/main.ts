// For more information, see https://crawlee.dev/
import {
  CheerioCrawler,
  createCheerioRouter,
  createPlaywrightRouter,
  enqueueLinks,
  PlaywrightCrawler,
  ProxyConfiguration,
} from "crawlee";
import { readFileSync } from "fs";

const proxyUrls = readFileSync("proxies.txt", "utf-8")
  .split(/\r?\n/)
  .filter((x) => x.trim().length > 0)
  .map((x) => {
    const [ip, port, username, password] = x.split(":");
    return `http://${username}:${password}@${ip}:${port}`;
  });
console.log(proxyUrls);
// const scrapoxyConfig = {
//   username: "asdf",
//   password: "asdf",
//   proxyUrl: "partido-obrero:8888",
//   apiUrl: "partido-obrero:8890",
// };

const proxyConf = new ProxyConfiguration({
  proxyUrls: proxyUrls, // proxyUrls: Array(100).fill(
  //   `http://${scrapoxyConfig.username}:${scrapoxyConfig.password}@${scrapoxyConfig.proxyUrl}/`
  //   // "http://asdfasdf-rotate:asdfasdf@p.webshare.io"
  // ),
});

const router = createCheerioRouter();
router.addHandler("DETAIL", async ({ request, parseWithCheerio, pushData }) => {
  const $ = await parseWithCheerio();

  const name = $("h1.product_page").text().trim();
  await pushData({ name, url: request.loadedUrl }, "products");
});
router.addHandler(
  "CATEGORY",
  async ({ request, enqueueLinks, log, pushData, parseWithCheerio }) => {
    // const title = await page.title();
    // log.info(`Title of ${request.loadedUrl} is '${title}'`);
    const $ = await parseWithCheerio();

    await enqueueLinks({
      selector: 'a[href^="/sitios/cdigi/producto"]',
      label: "DETAIL",
    });

    const productsEls = $("ul#products").children("li");

    for (const el of productsEls) {
      const title = $(el)
        .find(".atg_store_productTitle .descrip_full")
        .text()
        .trim();
      const href = $(el).find('a[href^="/sitios/cdigi/producto"]');
      await pushData({ title, url: href.attr("href") }, "product-list");
    }
    // Save results as JSON to ./storage/datasets/default

    // Extract links from the current page
    // and add them to the crawling queue.
    await enqueueLinks({
      selector: "[title=Siguiente]",
      label: "CATEGORY",
    });
  }
);
router.addDefaultHandler(async ({ enqueueLinks }) => {
  await enqueueLinks({
    urls: ["https://www.cotodigital3.com.ar/sitios/cdigi/browse"],
    label: "CATEGORY",
  });
});

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new CheerioCrawler({
  proxyConfiguration: proxyConf,
  ignoreSslErrors: true,

  useSessionPool: true,
  sessionPoolOptions: {
    blockedStatusCodes: [401, 403, 429, 500],
  },
  minConcurrency: 10,
  maxConcurrency: 50,
  maxRequestRetries: 50,
  requestHandlerTimeoutSecs: 30,
  requestHandler: router,
  // async errorHandler({ request, response, log }) {
  //   if (!response || !("statusCode" in response)) {
  //     log.error("Response has no statusCode", { response });
  //     return;
  //   }
  //   if (response.statusCode === 557) {
  //     log.warning("No proxy available, waiting");
  //     await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
  //     return;
  //   }
  //   const proxyName = response.headers["x-scrapoxy-proxyname"];
  //   log.warning(`Resetting proxy`, { proxyName, headers: response.headers });
  //   const res = await fetch(
  //     `http://${scrapoxyConfig.apiUrl}/api/scraper/project/proxies/remove`,
  //     {
  //       method: "POST",
  //       body: JSON.stringify([{ id: proxyName, force: false }]),
  //       headers: {
  //         Authorization: `Basic ${btoa(`${scrapoxyConfig.username}:${scrapoxyConfig.password}`)}`,
  //         "Content-Type": "application/json",
  //       },
  //     }
  //   );
  //   if (!res.ok)
  //     log.error(`status code ${res.status}`, { json: await res.json() });
  // },
});

await crawler.run(["https://www.cotodigital3.com.ar/"]);
