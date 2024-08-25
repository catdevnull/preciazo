# sepa-precios-importer

Importador de [datasets de precios de SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios/archivo/d076720f-a7f0-4af8-b1d6-1b99d5a90c14) a una base de datos PostgreSQL.

Vease [Errores en el formato de los datos SEPA](https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b)

To install dependencies:

```bash
bun install
bun run index.ts ~/carpeta-con-datasets-descomprimidos
```

This project was created using `bun init` in bun v1.1.26. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
