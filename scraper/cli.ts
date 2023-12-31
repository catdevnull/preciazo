import { scrapCarrefourProducts } from "../carrefour-link-scraper/index.js";
import { scrapCotoProducts } from "../coto-link-scraper/index.js";
import { scrapDiaProducts } from "../dia-link-scraper/index.js";
import { auto } from "./auto.js";
import { parseWarc } from "./scrap.js";

if (process.argv[2] === "auto") {
  await auto();
} else if (process.argv[2] === "scrap-carrefour-links") {
  await scrapCarrefourProducts()
} else if (process.argv[2] === "scrap-dia-links") {
  await scrapDiaProducts()
} else if (process.argv[2] === "scrap-coto-links") {
  await scrapCotoProducts()
} else if (process.argv[2] === "scrap") {
  const warcPaths = process.argv.slice(3);
  if (warcPaths.length > 0) {
    for (const path of warcPaths) {
      await parseWarc(path);
    }
  } else {
    console.error("Especificá WARCs para scrapear.");
    process.exit(1);
  }
} else {
  console.error("Especificá una acción (tipo `auto` o `scrap`) para hacer.");
  process.exit(1);
}
