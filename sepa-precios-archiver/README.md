# sepa-precios-archiver

Archivador del dataset de precios de [Precios Claros - Base SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios). Recomprime para utilizar ~8 veces menos espacio, y resube a un bucket mio de Backblaze B2.

## Instalación

Para instalar las dependencias:

```bash
bun install
```

Para ejecutarlo:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.1.25. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
