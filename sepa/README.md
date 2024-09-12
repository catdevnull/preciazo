# sepa

## sepa-precios-importer

Importador de [datasets de precios de SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios/archivo/d076720f-a7f0-4af8-b1d6-1b99d5a90c14) a una base de datos PostgreSQL.

Vease [Errores en el formato de los datos SEPA](https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b)

```bash
bun install
bun run importer.ts ~/carpeta-con-datasets-descomprimidos
```

## sepa-precios-archiver

Archivador del dataset de precios de [Precios Claros - Base SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios). Recomprime para utilizar ~8 veces menos espacio, y resube a un bucket mio de Backblaze B2.

```bash
bun install
bun run archiver.ts
```

## sepa-dataset-validator

un script para validar los datasets de SEPA automaticamente

basado en [la lista de problemas](https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b) que encontramos

para ejecutar, necesitas [Bun](https://bun.sh)

```bash
bun install
bun run dataset-validator/index.ts [ruta/al/dataset]
```

podes descargar un dump de [nuestro index](https://github.com/catdevnull/sepa-precios-metadata/blob/main/index.md) para analizar (la descarga pesa mucho menos que los oficiales :). para descomprimir, necesitas tener `zstd` y `tar`. después solo tenes que ejecutar `tar xvf ARCHIVO.tar.zst` y listo.
