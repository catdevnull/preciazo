import * as fs from "fs/promises";
import Papa from "papaparse";
import { basename, join, dirname } from "path";
import postgres from "postgres";
import { Readable } from "stream";
import { pipeline } from "node:stream/promises";
import { $, Glob } from "bun";
import PQueue from "p-queue";
import { extname } from "node:path";

// TODO: verificar que pasa cuando hay varios datasets del mismo día (como los suele haber cuando actualizan el dataset con nuevos comercios)

const sql = postgres({});

async function readFile(path: string) {
  // XXX: DORINKA SRL a veces envía archivos con UTF-16.
  const buffer = await fs.readFile(path, { encoding: null });
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le");
  } else {
    return buffer.toString("utf8");
  }
}

async function importSucursales(
  sql: postgres.Sql,
  datasetId: number,
  dir: string
) {
  const sucursales: Papa.ParseResult<any> = Papa.parse(
    await readFile(join(dir, "sucursales.csv")),
    {
      header: true,
    }
  );

  const objs = sucursales.data
    .filter((data) => data.id_comercio && data.id_bandera && data.id_sucursal)
    .map((data) => {
      // Megatone
      if ("sucursales_domingohorario_atencion" in data) {
        data.sucursales_domingo_horario_atencion =
          data.sucursales_domingohorario_atencion;
        delete data.sucursales_domingohorario_atencion;
      }
      return {
        id_dataset: datasetId,
        ...data,
      };
    });
  const keys = Object.keys(objs[0]);
  const lines = Readable.from(
    objs.map((data) => keys.map((key) => (data as any)[key]).join("\t") + "\n")
  );
  const writable =
    await sql`copy sucursales (${sql.unsafe(keys.join(", "))}) from stdin with CSV DELIMITER E'\t' QUOTE E'\b'`.writable();
  await pipeline(lines, writable);
}

async function importBanderas(
  sql: postgres.Sql,
  datasetId: number,
  dir: string
) {
  const banderas: Papa.ParseResult<any> = Papa.parse(
    await readFile(join(dir, "comercio.csv")),
    { header: true }
  );
  const objs = banderas.data.map((data) => ({
    id_dataset: datasetId,
    ...data,
  }));
  const keys = [
    "id_dataset",
    "id_comercio",
    "id_bandera",
    "comercio_cuit",
    "comercio_razon_social",
    "comercio_bandera_nombre",
    "comercio_bandera_url",
    "comercio_ultima_actualizacion",
    "comercio_version_sepa",
  ];
  const lines = Readable.from(
    objs
      .filter((data) => data.id_comercio && data.id_bandera)
      .map(
        (data) =>
          keys
            .map((key) => {
              const value = (data as any)[key];
              if (typeof value !== "string") {
                return value;
              }
              return value.replaceAll("\t", " ").trim();
            })
            .join("\t") + "\n"
      )
  );
  const writable =
    await sql`copy banderas (${sql.unsafe(keys.join(", "))}) from stdin with CSV DELIMITER E'\t' QUOTE E'\b'`.writable();
  await pipeline(lines, writable);
}

async function importDataset(dir: string) {
  console.log(dir);
  const date = basename(dir).match(/(\d{4}-\d{2}-\d{2})/)![1];
  const id_comercio = basename(dir).match(/comercio-sepa-(\d+)/)![1];
  // TODO: parsear "Ultima actualizacion" al final del CSV y insertarlo en la tabla datasets

  try {
    await sql.begin(async (sql) => {
      let datasetId: number;
      const res =
        await sql`insert into datasets (name, date, id_comercio) values (${basename(dir)}, ${date}, ${id_comercio}) returning id`;
      datasetId = res[0].id;

      const comercios: Papa.ParseResult<{ comercio_cuit: string }> = Papa.parse(
        await readFile(join(dir, "comercio.csv")),
        { header: true }
      );
      const comercioCuit = comercios.data[0].comercio_cuit;
      console.log(`dataset ${datasetId}, comercio ${comercioCuit}`);

      await importBanderas(sql, datasetId, dir);
      await importSucursales(sql, datasetId, dir);

      let file = await readFile(join(dir, "productos.csv"));
      // WALL OF SHAME: estos proveedores no saben producir CSVs correctos
      if (comercioCuit == "30612929455") {
        // Libertad S.A.
        file = file.replaceAll("|RAPTOR 6X16X45", "/RAPTOR 6X16X45");
      } else if (comercioCuit == "30578411174") {
        // Alberdi S.A.
        file = file.replaceAll(";", "|");
      }
      if (["30707429468", "30589621499"].includes(comercioCuit)) {
        // TODO: si tienen los valores, pero con otros nombres, por ejemplo
        // productos_precio_lista seria precio_unitario_bulto_por_unidad_venta_con_iva.
        // pero no quiero mentir, asi que por ahora no lo importo
        throw new Error(
          `No voy a importar el dataset ${dir} porque el formato está mal. Pero se podría importar. Pero por ahora no lo voy a hacer. Véase https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b`
        );
      }

      console.time("parse");

      const writable =
        await sql`copy precios (id_dataset, id_comercio, id_bandera, id_sucursal, id_producto, productos_ean, productos_descripcion, productos_cantidad_presentacion, productos_unidad_medida_presentacion, productos_marca, productos_precio_lista, productos_precio_referencia, productos_cantidad_referencia, productos_unidad_medida_referencia, productos_precio_unitario_promo1, productos_leyenda_promo1, productos_precio_unitario_promo2, productos_leyenda_promo2) from stdin with CSV DELIMITER E'\t' QUOTE E'\b'`.writable();

      let rowCount = 0;

      async function* processRows() {
        const parsedData = Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
        });

        for (const data of parsedData.data as any[]) {
          if (
            data.id_comercio &&
            data.id_bandera &&
            data.id_sucursal &&
            data.id_producto
          ) {
            delete data.id_dun_14;
            const row = {
              id_dataset: datasetId,
              ...data,
              productos_descripcion: data.productos_descripcion
                .replaceAll("\t", " ")
                .trim(),
              productos_marca: data.productos_marca.trim(),
            };
            const values =
              [
                row.id_dataset,
                row.id_comercio,
                row.id_bandera,
                row.id_sucursal,
                row.id_producto,
                row.productos_ean,
                row.productos_descripcion,
                row.productos_cantidad_presentacion,
                row.productos_unidad_medida_presentacion,
                row.productos_marca,
                row.productos_precio_lista,
                row.productos_precio_referencia,
                row.productos_cantidad_referencia,
                row.productos_unidad_medida_referencia,
                row.productos_precio_unitario_promo1,
                row.productos_leyenda_promo1,
                row.productos_precio_unitario_promo2,
                row.productos_leyenda_promo2,
              ].join("\t") + "\n";

            rowCount++;
            yield values;
          }
        }
      }

      const generator = processRows();
      await pipeline(Readable.from(generator), writable);

      console.timeEnd("parse");
      console.info(`saved ${rowCount} rows`);

      Bun.gc(true);
    });
  } catch (e) {
    if ((e as any).code == "23505") {
      console.log(`dataset ${basename(dir)} already exists`);
      return;
    }
    throw e;
  }
}

async function importDatasetTar(tarPath: string) {
  console.log(`importing tar ${tarPath}`);
  const dir = await fs.mkdtemp("/tmp/sepa-precios-importer-");
  try {
    await $`tar -x -C ${dir} -f ${tarPath}`;
    async function unzipRecursively(dir: string) {
      for (const file of await fs.readdir(dir)) {
        const path = join(dir, file);
        const stat = await fs.lstat(path);

        if (stat.isDirectory()) {
          await unzipRecursively(path);
        } else if (extname(file) === ".zip") {
          const extractDir = join(dir, basename(file, ".zip"));
          await fs.mkdir(extractDir, { recursive: true });
          await $`cd ${dir} && unzip ${path} -d ${extractDir}`;
          await fs.rm(path);
          await unzipRecursively(extractDir);
        }
      }
    }

    await unzipRecursively(dir);
    await importDump(dir);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
}
async function importDump(dumpDir: string) {
  const pQueue = new PQueue({ concurrency: 2 });
  const glob = new Glob("**/productos.csv");
  for await (const file of glob.scan(dumpDir)) {
    const dir = join(dumpDir, dirname(file));
    pQueue.add(() => importDataset(dir));
  }
  await pQueue.onIdle();
}

try {
  const tarGlob = new Glob("**/*.tar.zst");
  let hasTars = false;
  for await (const file of tarGlob.scan(process.argv[2])) {
    hasTars = true;
    const tar = join(process.argv[2], file);
    await importDatasetTar(tar);
  }

  if (!hasTars) {
    await importDump(process.argv[2]);
  }
} finally {
  await sql.end();
}
