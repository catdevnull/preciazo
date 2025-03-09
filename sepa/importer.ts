import * as fs from "fs/promises";
import Papa from "papaparse";
import { basename, join, dirname } from "path";
import { Readable } from "stream";
import { pipeline } from "node:stream/promises";
import { $, Glob } from "bun";
import PQueue from "p-queue";
import { extname } from "node:path";
import { DuckDBDecimalValue, DuckDBInstance } from "@duckdb/node-api";
import { stat, writeFile } from "node:fs/promises";

// TODO: verificar que pasa cuando hay varios datasets del mismo día (como los suele haber cuando actualizan el dataset con nuevos comercios)

async function readFile(path: string) {
  // XXX: DORINKA SRL a veces envía archivos con UTF-16.
  const buffer = await fs.readFile(path, { encoding: null });
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le");
  } else {
    return buffer.toString("utf8");
  }
}

// async function importSucursales(
//   sql: postgres.Sql,
//   datasetId: number,
//   dir: string
// ) {
//   const sucursales: Papa.ParseResult<any> = Papa.parse(
//     await readFile(join(dir, "sucursales.csv")),
//     {
//       header: true,
//     }
//   );

//   const objs = sucursales.data
//     .filter((data) => data.id_comercio && data.id_bandera && data.id_sucursal)
//     .map((data) => {
//       // Megatone
//       if ("sucursales_domingohorario_atencion" in data) {
//         data.sucursales_domingo_horario_atencion =
//           data.sucursales_domingohorario_atencion;
//         delete data.sucursales_domingohorario_atencion;
//       }
//       return {
//         id_dataset: datasetId,
//         ...data,
//       };
//     });
//   const keys = Object.keys(objs[0]);
//   const lines = Readable.from(
//     objs.map((data) => keys.map((key) => (data as any)[key]).join("\t") + "\n")
//   );
//   const writable =
//     await sql`copy sucursales (${sql.unsafe(keys.join(", "))}) from stdin with CSV DELIMITER E'\t' QUOTE E'\b'`.writable();
//   await pipeline(lines, writable);
// }

// async function importBanderas(
//   sql: postgres.Sql,
//   datasetId: number,
//   dir: string
// ) {
//   const banderas: Papa.ParseResult<any> = Papa.parse(
//     await readFile(join(dir, "comercio.csv")),
//     { header: true }
//   );
//   const objs = banderas.data.map((data) => ({
//     id_dataset: datasetId,
//     ...data,
//   }));
//   const keys = [
//     "id_dataset",
//     "id_comercio",
//     "id_bandera",
//     "comercio_cuit",
//     "comercio_razon_social",
//     "comercio_bandera_nombre",
//     "comercio_bandera_url",
//     "comercio_ultima_actualizacion",
//     "comercio_version_sepa",
//   ];
//   const lines = Readable.from(
//     objs
//       .filter((data) => data.id_comercio && data.id_bandera)
//       .map(
//         (data) =>
//           keys
//             .map((key) => {
//               const value = (data as any)[key];
//               if (typeof value !== "string") {
//                 return value;
//               }
//               return value.replaceAll("\t", " ").trim();
//             })
//             .join("\t") + "\n"
//       )
//   );
//   const writable =
//     await sql`copy banderas (${sql.unsafe(keys.join(", "))}) from stdin with CSV DELIMITER E'\t' QUOTE E'\b'`.writable();
//   await pipeline(lines, writable);
// }

class ExpectedDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpectedDatasetError";
  }
}

/**
 * Patches the productos.csv file inline to fix formatting issues from different providers.
 * Some providers send malformed CSV files that need special handling.
 *
 * @param dir - Directory containing the dataset files
 */
async function patchPreciosCsv(dir: string) {
  const comercios: Papa.ParseResult<{ comercio_cuit: string }> = Papa.parse(
    await readFile(join(dir, "comercio.csv")),
    { header: true }
  );
  const comercioCuit = comercios.data[0].comercio_cuit;
  console.log(`comercio ${comercioCuit}`);

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
    throw new ExpectedDatasetError(
      `No voy a importar el dataset ${dir} porque el formato está mal. Pero se podría importar. Pero por ahora no lo voy a hacer. Véase https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b`
    );
  }
  if (
    [
      // Rafaela Alimentos/Lario - tienen varios productos con el mismo EAN
      "33500529909",
    ].includes(comercioCuit)
  ) {
    throw new ExpectedDatasetError(
      `No se puede importar el dataset ${dir} porque el dataset es parcialmente invalido y es irrelevante para este proyecto.`
    );
  }
  if (
    [
      // Megatone
      "30543659734",
      // Alberdi S.A.
      "30578411174",
    ].includes(comercioCuit)
  ) {
    throw new ExpectedDatasetError(
      `No se puede importar el dataset ${dir} porque el dataset es completamente invalido.`
    );
  }
  if (
    [
      // California S.A.
      "30539523410",
      // Musimundo
      "33572266449",
    ].includes(comercioCuit)
  ) {
    // borrar filas con rows duplicadas
    const existingIdSets = new Set<string>();
    const rows = file.split("\n");
    file = "";
    for (const row of rows) {
      const idSet =
        row.split("|")[0] +
        "|" +
        row.split("|")[1] +
        "|" +
        row.split("|")[2] +
        "|" +
        row.split("|")[3];
      if (!existingIdSets.has(idSet)) {
        existingIdSets.add(idSet);
        file += row + "\n";
      }
    }
  }
  // borrar Última actualización al final del archivo
  file = file.replace(/\r?\n(&#032;)?\0? *\r?\n"?[uúUÚÃÃ³].*/giu, "");
  // file = file.replaceAll(/[ \t]*\n/g, "\n");
  await writeFile(join(dir, "productos.csv"), file);
}

async function importDump(dumpDir: string) {
  const dumpName = basename(dumpDir);
  const glob = new Glob("**/productos.csv");

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  await connection.run(`
  CREATE TABLE precios (
    id_comercio INTEGER not null,
    id_bandera INTEGER not null,
    id_sucursal INTEGER not null,
    id_producto BIGINT not null,
    productos_ean INTEGER,
    --productos_descripcion TEXT,
    productos_cantidad_presentacion DECIMAL(10,2),
    --productos_unidad_medida_presentacion TEXT,
    --productos_marca TEXT,
    productos_precio_lista DECIMAL(10,2),
    productos_precio_referencia DECIMAL(10,2),
    productos_cantidad_referencia DECIMAL(10,2),
    --productos_unidad_medida_referencia TEXT,
    --productos_precio_unitario_promo1 DECIMAL(10,2),
    --productos_leyenda_promo1 TEXT,
    --productos_precio_unitario_promo2 DECIMAL(10,2),
    --productos_leyenda_promo2 TEXT,
    CONSTRAINT unique_product_entry UNIQUE (id_comercio, id_bandera, id_sucursal, id_producto)
  );
  `);

  console.time("import");
  for await (const file of glob.scan(dumpDir)) {
    const datasetDir = join(dumpDir, dirname(file));

    console.log(datasetDir);
    // const date = basename(datasetDir).match(/(\d{4}-\d{2}-\d{2})/)![1];
    // const id_comercio = basename(datasetDir).match(/comercio-sepa-(\d+)/)![1];
    // TODO: parsear "Ultima actualizacion" al final del CSV y insertarlo en la tabla datasets

    // const datasetName = basename(datasetDir);

    try {
      await patchPreciosCsv(datasetDir);
      await connection.run(`
      WITH cleaned_data AS (
        SELECT
          id_comercio,
          id_bandera,
          id_sucursal,
          id_producto,
          productos_ean,
          REPLACE(TRIM(REPLACE(productos_descripcion, '\t', ' ')), '\t', ' ') AS productos_descripcion,
          productos_cantidad_presentacion,
          productos_unidad_medida_presentacion,
          TRIM(productos_marca) AS productos_marca,
          productos_precio_lista,
          productos_precio_referencia,
          productos_cantidad_referencia,
          productos_unidad_medida_referencia,
          productos_precio_unitario_promo1,
          productos_leyenda_promo1,
          productos_precio_unitario_promo2,
          productos_leyenda_promo2
        FROM read_csv('${join(datasetDir, "productos.csv")}',
          header=true, columns={
            'id_comercio': 'INTEGER',
            'id_bandera': 'INTEGER',
            'id_sucursal': 'INTEGER',
            'id_producto': 'BIGINT',
            'productos_ean': 'INTEGER',
            'productos_descripcion': 'TEXT',
            'productos_cantidad_presentacion': 'DECIMAL(10,2)',
            'productos_unidad_medida_presentacion': 'TEXT',
            'productos_marca': 'TEXT',
            'productos_precio_lista': 'DECIMAL(10,2)',
            'productos_precio_referencia': 'DECIMAL(10,2)',
            'productos_cantidad_referencia': 'DECIMAL(10,2)',
            'productos_unidad_medida_referencia': 'TEXT',
            'productos_precio_unitario_promo1': 'DECIMAL(10,2)',
            'productos_leyenda_promo1': 'TEXT',
            'productos_precio_unitario_promo2': 'DECIMAL(10,2)',
            'productos_leyenda_promo2': 'TEXT',
          }
        )
      )
      INSERT INTO precios SELECT
        id_comercio,
        id_bandera,
        id_sucursal,
        id_producto,
        productos_ean,
        --productos_descripcion,
        productos_cantidad_presentacion,
        --productos_unidad_medida_presentacion,
        --productos_marca,
        productos_precio_lista,
        productos_precio_referencia,
        productos_cantidad_referencia
      FROM cleaned_data;
    `);
    } catch (e) {
      if (e instanceof ExpectedDatasetError) {
        console.error(`👍 skipping ${datasetDir}:`, e.message);
      } else {
        console.error(`error importing ${datasetDir}:`, e);
      }
    }
  }

  await connection.run(`
    COPY precios TO '${dumpName}.parquet' (FORMAT parquet, COMPRESSION zstd);
  `);
  connection.close();
  console.timeEnd("import");
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
    // await fs.rm(dir, { recursive: true });
  }
}

try {
  const file = await stat(process.argv[2]);
  if (file.isDirectory()) {
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
  } else {
    await importDatasetTar(process.argv[2]);
  }
} finally {
}
