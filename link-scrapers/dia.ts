import pMap from "p-map";
import { parseHTML } from "linkedom";
import { saveUrls } from "db-datos/urlHelpers.js";
import { getUrlsFromSitemap } from "./common.js";

const categorias = [
  "https://diaonline.supermercadosdia.com.ar/almacen",
  "https://diaonline.supermercadosdia.com.ar/almacen/conservas",
  "https://diaonline.supermercadosdia.com.ar/almacen/aceites-y-aderezos",
  "https://diaonline.supermercadosdia.com.ar/almacen/pastas-secas",
  "https://diaonline.supermercadosdia.com.ar/almacen/arroz-y-legumbres",
  "https://diaonline.supermercadosdia.com.ar/almacen/panaderia",
  "https://diaonline.supermercadosdia.com.ar/almacen/golosinas-y-alfajores",
  "https://diaonline.supermercadosdia.com.ar/almacen/reposteria",
  "https://diaonline.supermercadosdia.com.ar/almacen/comidas-listas",
  "https://diaonline.supermercadosdia.com.ar/almacen/harinas",
  "https://diaonline.supermercadosdia.com.ar/almacen/picadas",
  "https://diaonline.supermercadosdia.com.ar/almacen/panaderia/pan-rallado-y-rebozadores",
  "https://diaonline.supermercadosdia.com.ar/desayuno",
  "https://diaonline.supermercadosdia.com.ar/desayuno/galletitas-y-cereales",
  "https://diaonline.supermercadosdia.com.ar/desayuno/infusiones-y-endulzantes",
  "https://diaonline.supermercadosdia.com.ar/desayuno/para-untar",
  "https://diaonline.supermercadosdia.com.ar/frescos",
  "https://diaonline.supermercadosdia.com.ar/frescos/leches",
  "https://diaonline.supermercadosdia.com.ar/frescos/fiambreria",
  "https://diaonline.supermercadosdia.com.ar/frescos/lacteos",
  "https://diaonline.supermercadosdia.com.ar/frescos/carniceria",
  "https://diaonline.supermercadosdia.com.ar/frescos/frutas-y-verduras",
  "https://diaonline.supermercadosdia.com.ar/frescos/pastas-frescas",
  "https://diaonline.supermercadosdia.com.ar/frescos/listos-para-disfrutar",
  "https://diaonline.supermercadosdia.com.ar/frescos/frutas-y-verduras/frutas",
  "https://diaonline.supermercadosdia.com.ar/frescos/frutas-y-verduras/verduras",
  "https://diaonline.supermercadosdia.com.ar/frescos/frutas-y-verduras/huevos",
  "https://diaonline.supermercadosdia.com.ar/frescos/frutas-y-verduras/frutos-secos",
  "https://diaonline.supermercadosdia.com.ar/bebidas",
  "https://diaonline.supermercadosdia.com.ar/bebidas/gaseosas",
  "https://diaonline.supermercadosdia.com.ar/bebidas/cervezas",
  "https://diaonline.supermercadosdia.com.ar/bebidas/aguas",
  "https://diaonline.supermercadosdia.com.ar/bebidas/bodega",
  "https://diaonline.supermercadosdia.com.ar/bebidas/jugos-e-isot%C3%B3nicas",
  "https://diaonline.supermercadosdia.com.ar/bebidas/aperitivos",
  "https://diaonline.supermercadosdia.com.ar/bebidas/bebidas-blancas-y-licores",
  "https://diaonline.supermercadosdia.com.ar/congelados",
  "https://diaonline.supermercadosdia.com.ar/congelados/hamburguesas-y-medallones",
  "https://diaonline.supermercadosdia.com.ar/congelados/rebozados",
  "https://diaonline.supermercadosdia.com.ar/congelados/vegetales-congelados",
  "https://diaonline.supermercadosdia.com.ar/congelados/postres-congelados",
  "https://diaonline.supermercadosdia.com.ar/congelados/pescaderia",
  "https://diaonline.supermercadosdia.com.ar/congelados/papas-congeladas",
  "https://diaonline.supermercadosdia.com.ar/congelados/comidas-congeladas",
  "https://diaonline.supermercadosdia.com.ar/congelados/hielo",
  "https://diaonline.supermercadosdia.com.ar/limpieza",
  "https://diaonline.supermercadosdia.com.ar/limpieza/cuidado-de-la-ropa",
  "https://diaonline.supermercadosdia.com.ar/limpieza/papeleria",
  "https://diaonline.supermercadosdia.com.ar/limpieza/limpiadores",
  "https://diaonline.supermercadosdia.com.ar/limpieza/limpieza-de-cocina",
  "https://diaonline.supermercadosdia.com.ar/limpieza/accesorios-de-limpieza",
  "https://diaonline.supermercadosdia.com.ar/limpieza/desodorantes-de-ambiente",
  "https://diaonline.supermercadosdia.com.ar/limpieza/insecticidas",
  "https://diaonline.supermercadosdia.com.ar/limpieza/fosforos-y-velas",
  "https://diaonline.supermercadosdia.com.ar/limpieza/bolsas",
  "https://diaonline.supermercadosdia.com.ar/4160?map=productClusterIds&order=OrderByBestDiscountDESC",
  "https://diaonline.supermercadosdia.com.ar/4136?map=productClusterIds&order=OrderByBestDiscountDESC",
  "https://diaonline.supermercadosdia.com.ar/4143?map=productClusterIds&order=OrderByBestDiscountDESC",
  "https://diaonline.supermercadosdia.com.ar/4189?map=productClusterIds&order=OrderByBestDiscountDESC",
  "https://diaonline.supermercadosdia.com.ar/4086?map=productClusterIds&order=OrderByBestDiscountDESC",
  "https://diaonline.supermercadosdia.com.ar/2089?map=productClusterIds&order=OrderByBestDiscountDESC",
];

export async function scrapDiaProducts() {
  await Promise.all([
    // scrapBySite(),
    scrapBySitemap(),
  ]);
}

async function scrapBySitemap() {
  // de https://diaonline.supermercadosdia.com.ar/sitemap.xml
  const sitemaps = [
    "https://diaonline.supermercadosdia.com.ar/sitemap/product-1.xml",
    "https://diaonline.supermercadosdia.com.ar/sitemap/product-2.xml",
    "https://diaonline.supermercadosdia.com.ar/sitemap/product-3.xml",
    "https://diaonline.supermercadosdia.com.ar/sitemap/product-4.xml",
    "https://diaonline.supermercadosdia.com.ar/sitemap/product-5.xml",
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

async function scrapBySite() {
  const links = categorias.flatMap((link) =>
    Array.from({ length: 51 }, (x, i) => i).map((i) => {
      const url = new URL(link);
      url.searchParams.set("page", `${i}`);
      return url.toString();
    })
  );

  await pMap(
    links,
    async (url) => {
      const res = await fetch(url, { timeout: false });
      const html = await res.text();
      const { document } = parseHTML(html);

      const hrefs = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          "a.vtex-product-summary-2-x-clearLink"
        ),
        (a) => new URL(a.href, url).toString()
      );
      saveUrls(hrefs);
    },
    { concurrency: 32 }
  );
}
