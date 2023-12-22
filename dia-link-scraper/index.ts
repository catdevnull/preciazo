import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { height: 4000, width: 1920 },
  });
  const page = await browser.newPage();

  await page.goto("https://diaonline.supermercadosdia.com.ar/almacen/");

  async function getHrefs() {
    return await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          "a.vtex-product-summary-2-x-clearLink"
        ),
        (a) => new URL(a.href).toString()
      )
    );
  }
  const seeMoreSel = "button ::-p-text(Ver más Productos)";
  await page.waitForSelector(seeMoreSel);

  try {
    let prev = { n: 0, d: Date.now() };
    while (true) {
      const hrefs = await getHrefs();
      console.debug(prev);
      if (prev.n === hrefs.length && Date.now() > prev.d + 15000) break;
      prev = { n: hrefs.length, d: Date.now() };

      const seeMoreEl = await page.$eval(seeMoreSel, (el) => {
        el.parentElement?.click();
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      await wait(150);
    }
    const hrefs = await getHrefs();
    hrefs.forEach((l) => console.log(l));
  } finally {
    await browser.close();
  }
})();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve(void 0), ms));
}
