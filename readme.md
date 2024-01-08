# preciazo

scrapeo "masivo" de precios y datos en supermercados argentinos

## componentes (en orden de proceso)

- los link scrapers ([link-scrapers/](./link-scrapers/)) crean listas de links a productos para scrapear

  (no hace falta correrlos porque ya hay listas armadas en [data/](./data/))

- el [scraper](./scraper/) descarga todos los links, extrayendo varios datos y guardandolos en una base de datos SQLite (definida en [db-datos](./db-datos/schema.ts))
- el [sitio](./sitio/) renderiza páginas a partir de la base de datos y hace gráficos lindos

## setup

hay que instalar [Bun](https://bun.sh/), que lo estoy usando porque hacía que el scraper corra más rápido. quizás en el futuro lo reemplace con good old Node.js.

después, escrapea un sample de productos de Carrefour a una BD:

```
cd scraper/
bun install
bun cli.ts scrap ./data/samples/Carrefour.50.txt
```

ahora miralo en el sitio:

```
cd sitio/
bun install
bun dev
```
