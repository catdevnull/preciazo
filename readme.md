# preciazo

scrapeo "masivo" de precios y datos en supermercados argentinos

## componentes (en orden de proceso)

- los link scrapers ([coto-link-scraper](./coto-link-scraper/), [dia-link-scraper](./dia-link-scraper/) y [carrefour-link-scraper](./carrefour-link-scraper)) crean listas de links a productos para scrapear

  (no hace falta correrlos porque ya hay listas armadas en [data/](./data/))

- [warcificator](./warcificator/) descarga las paginas de productos y genera un archivo [WARC](https://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.0/) con ellas
- el [scraper](./scraper/) procesa estos WARCs, extrayendo varios datos y guardandolos en una base de datos SQLite (definida en [db-datos](./db-datos/schema.ts))
- el [sitio](./sitio/) renderiza páginas a partir de la base de datos y hace gráficos lindos

## setup

hay que instalar [Bun](https://bun.sh/), que lo estoy usando porque hacía que el scraper corra más rápido. quizás en el futuro lo reemplace con good old Node.js.

aparte, se necesita zstd, que se usa para comprimir los WARCs eficientemente. seguro está disponible en las repos de tu distro favorita :)

empezá descargando un WARC con 50 páginas de sample, y recomprimilo con zstd:

```
wget --no-verbose --tries=3 --delete-after --input-file ./data/samples/Dia.txt --warc-file=dia-sample
gzip -dc dia-sample.warc.gz | zstd --long -15 --no-sparse -o dia-sample.warc.zst
```

después, scrapealo a una BD:

```
cd scraper/
bun install
bun cli.ts scrap ../dia-sample.warc.zst
```

ahora miralo en el sitio:

```
cd sitio/
bun install
bun dev
```
