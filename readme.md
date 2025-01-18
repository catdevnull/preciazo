# preciazo

scrapeo "masivo" de precios y datos en supermercados argentinos

## [¡entrá a la demo!](https://preciazo.experimentos.nulo.ar/)

¿te interesa colaborar con el proyecto? hablame [por Twitter](https://twitter.com/esoesnulo), por [email](mailto:preciazo@nulo.ar) o por GitHub :)

## proyectos similares

- [ratoneando](https://ratoneando.ar/)
- [Mirá](https://twitter.com/MiraPrecios) (solo app nativa, creo que usan un navegador embebido para generar el carrito en los sitios de los supermercados!)
- [SEPAME](https://sepame.net/): muestra todos los precios de todas las sucursales según el [dataset SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios)
- [Coto_bot](https://twitter.com/BotCoto) (repo: [Vosinepi/webScrapping_ETL_canasta_basica](https://github.com/Vosinepi/webScrapping_ETL_canasta_basica))
- [@canastita_bot](https://twitter.com/canastita_bot) y [@asadito_bot](https://twitter.com/asadito_bot) de [Charly Maslaton](https://twitter.com/charlymasla)
- [Yoper](https://www.yoper.com.ar/) ([@YoperLATAM](https://x.com/YoperLATAM))

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
cd ../rust/
cargo run --bin scraper -- fetch-list ../data/samples/Carrefour.50.txt
```

ahora miralo en el sitio:

```
cd ../sitio/
pnpm install
pnpm dev
```
