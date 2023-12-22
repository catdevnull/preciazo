// Import puppeteer
import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(
    "https://www.cotodigital3.com.ar/sitios/cdigi/browse/catalogo-almac%C3%A9n/"
  );

  async function getHrefs() {
    const element = await page.waitForSelector(".product_info_container a");
    await element?.dispose();
    const hrefs = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          ".product_info_container a"
        ),
        (a) => new URL(a.href).toString()
      )
    );
    return hrefs;
  }
  try {
    while (true) {
      const hrefs = await getHrefs();
      hrefs.forEach((href) => console.log(href));

      const btn = await page.waitForSelector('a[title="Siguiente"]', {
        timeout: 5000,
      });
      await btn?.click();
      await btn?.dispose();
    }
  } finally {
    await browser.close();
  }
})();
