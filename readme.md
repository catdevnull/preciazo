# preciazo

scrapeo "masivo" de precios y datos en supermercados argentinos

## componentes

### scraper-rs

el [scraper](./scraper-rs/) busca links de productos a scrapear, descarga todos los links, extrae varios datos y los guarda en una base de datos SQLite (definida en [db-datos](./db-datos/schema.ts)).

(antes había un scraper escrito en JavaScript, pero por problemas de _reliability_ lo reescribí en Rust (?))

### sitio

el [sitio](./sitio/) renderiza páginas a partir de la base de datos y hace gráficos lindos.

## setup

para el schema de la base de datos y el sitio, es necesario [Node.js](https://nodejs.org/) y [pnpm](https://pnpm.io/). para el scraper, es necesario [Rust](https://www.rust-lang.org/) estable.

crea la base de datos:
```
cd db-datos/
pnpm install
pnpm migrate
```

después, escrapea un sample de productos de Carrefour a una BD:

```
cd ../scraper-rs/
cargo run -- fetch-list ../data/samples/Carrefour.50.txt
```

ahora miralo en el sitio:

```
cd ../sitio/
pnpm install
pnpm dev
```
