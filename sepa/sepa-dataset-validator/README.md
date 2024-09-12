# sepa-dataset-validator

un script para validar los datasets de SEPA automaticamente

basado en [la lista de problemas](https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b) que encontramos

para ejecutar, necesitas [Bun](https://bun.sh)

```bash
bun install
bun run . [ruta/al/dataset]
```

podes descargar un dump de [nuestro index](https://github.com/catdevnull/sepa-precios-metadata/blob/main/index.md) para analizar (la descarga pesa mucho menos que los oficiales :). para descomprimir, necesitas tener `zstd` y `tar`. después solo tenes que ejecutar `tar xvf ARCHIVO.tar.zst` y listo.
