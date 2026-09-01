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

### Contenedor y despliegue con Uncloud

El contenedor del archivador ejecuta una pasada inmediatamente y, al terminar,
espera dos horas antes de la siguiente. Si una pasada falla, reintenta después
de cinco minutos. Solo hay que desplegar una réplica.

Para probar exactamente la misma ejecución que se usa en producción:

```bash
docker build -f sepa/archiver.Dockerfile -t preciazo-archiver:test sepa
docker run --rm --env-file sepa/.env \
  --entrypoint bun preciazo-archiver:test run /app/archiver.ts
```

Los secretos del despliegue se leen de un Secure Note de Bitwarden llamado
`preciazo-archiver`. Cada secreto es un custom field oculto. Para importar o
actualizar el item desde el `.env` local:

```bash
bw login
export BW_SESSION="$(bw unlock --raw)"
./scripts/bitwarden-import-archiver-env.sh sepa/.env
```

Se puede usar otro nombre o ID de item exportando `BW_ARCHIVER_ITEM_ID`. El URL
de Uptime Kuma es opcional para el contenedor, pero debe existir como campo
`UPTIME_KUMA_PUSH_URL` (puede estar vacío) para que Uncloud resuelva el secreto.

Con el CLI de Uncloud conectado a un cluster:

```bash
export BW_SESSION="$(bw unlock --raw)"
uc deploy -f compose.archiver.yaml
uc logs preciazo-archiver
```

`uc deploy` ejecuta localmente `scripts/bitwarden-secret.sh` para resolver cada
valor y lo entrega al contenedor como variable de entorno. El `.env` queda solo
como copia local ignorada por Git y no forma parte de la imagen.

## sepa-dataset-validator

un script para validar los datasets de SEPA automaticamente

basado en [la lista de problemas](https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b) que encontramos

para ejecutar, necesitas [Bun](https://bun.sh)

```bash
bun install
bun run dataset-validator/index.ts [ruta/al/dataset]
```

podes descargar un dump de [nuestro index](https://github.com/catdevnull/sepa-precios-metadata/blob/main/index.md) para analizar (la descarga pesa mucho menos que los oficiales :). para descomprimir, necesitas tener `zstd` y `tar`. después solo tenes que ejecutar `tar xvf ARCHIVO.tar.zst` y listo.
