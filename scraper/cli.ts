import { scrapCarrefourProducts } from "../link-scrapers/carrefour.js";
import { scrapCotoProducts } from "../link-scrapers/coto.js";
import { scrapDiaProducts } from "../link-scrapers/dia.js";
import { auto } from "./auto.js";
import { downloadList, getProduct } from "./scrap.js";

if (process.argv[2] === "auto") {
  await auto();
} else if (process.argv[2] === "scrap-carrefour-links") {
  await scrapCarrefourProducts();
} else if (process.argv[2] === "scrap-dia-links") {
  await scrapDiaProducts();
} else if (process.argv[2] === "scrap-coto-links") {
  await scrapCotoProducts();
} else if (process.argv[2] === "scrap-link") {
  const url = new URL(process.argv[3]);
  const res = await fetch(url);
  const text = await res.text();
  console.info(getProduct(url, text));
} else if (process.argv[2] === "scrap") {
  const urlLists = process.argv.slice(3);
  if (urlLists.length > 0) {
    for (const path of urlLists) {
      const res = await downloadList(path);
      console.info("=======================================");
      console.info(path, res);
      console.info("=======================================");
    }
  } else {
    console.error("Especificá listas de urls para scrapear.");
    process.exit(1);
  }
} else {
  console.error("Especificá una acción (tipo `auto` o `scrap`) para hacer.");
  process.exit(1);
}
