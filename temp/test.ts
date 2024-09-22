import * as cheerio from "cheerio";

const res = await fetch(
  "https://www.carrefour.com.ar/detergente-cif-bioactive-limon-500-cc-717847/p"
);
const html = await res.text();
Bun.write("carrefour.html", html);
const $ = cheerio.load(html);

const listPrice = $(
  ".valtech-carrefourar-product-price-0-x-listPrice .valtech-carrefourar-product-price-0-x-currencyContainer"
).text();
const salePrice = $(
  ".valtech-carrefourar-product-price-0-x-sellingPriceValue .valtech-carrefourar-product-price-0-x-currencyContainer"
).text();
const promo = $(
  ".valtech-carrefourar-product-highlights-0-x-productHighlightWrapper"
).attr("data-highlight-name");
console.log(listPrice, salePrice, promo);
