import * as fs from "fs/promises";
import Papa from "papaparse";
import { basename, join, dirname } from "path";
import { extname } from "node:path";
import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { mkdir, stat, writeFile } from "node:fs/promises";
import cliProgress from "cli-progress";
import PQueue from "p-queue";
import { cpus } from "os";
import { execFile as execFileSync } from "node:child_process";
import { promisify } from "node:util";
import fg from "fast-glob";
import { z } from "zod";
const execFile = promisify(execFileSync);

const metadataInstance = await DuckDBInstance.create();
{
  const conn = await metadataInstance.connect();
  await conn.run(`
    CREATE TABLE metadata (
      id_comercio INTEGER,
      id_producto BIGINT,
      productos_descripcion TEXT,
      productos_marca TEXT,
      productos_unidad_medida_presentacion TEXT,
      productos_unidad_medida_referencia TEXT,
      productos_cantidad_presentacion DECIMAL(10,2),
      productos_cantidad_referencia DECIMAL(10,2),
      PRIMARY KEY (id_comercio, id_producto)
    );
  `);
}

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

class SucursalesImporter {
  constructor(private readonly connection: DuckDBConnection) {}

  async setupTable() {
    await this.connection.run(`
    CREATE TABLE sucursales (
      id_comercio INTEGER,
      id_bandera INTEGER,
      id_sucursal INTEGER,
      sucursales_nombre TEXT,
      sucursales_tipo TEXT,
      sucursales_calle TEXT,
      sucursales_numero TEXT,
      sucursales_latitud DECIMAL(10,6),
      sucursales_longitud DECIMAL(10,6),
      sucursales_observaciones TEXT,
      sucursales_barrio TEXT,
      sucursales_codigo_postal TEXT,
      sucursales_localidad TEXT,
      sucursales_provincia TEXT,
      sucursales_lunes_horario_atencion TEXT,
      sucursales_martes_horario_atencion TEXT,
      sucursales_miercoles_horario_atencion TEXT,
      sucursales_jueves_horario_atencion TEXT,
      sucursales_viernes_horario_atencion TEXT,
      sucursales_sabado_horario_atencion TEXT,
      sucursales_domingo_horario_atencion TEXT,
      PRIMARY KEY (id_comercio, id_bandera, id_sucursal)
    );
    `);
  }

  async importAndPatchCsv(file: string) {
    let csv = await readFile(file);
    csv = removeUltimaActualizacion(csv);
    await writeFile(file, csv);
    await this.connection.run(`
    WITH cleaned_data AS (
      SELECT
        id_comercio,
        id_bandera,
        id_sucursal,
        sucursales_nombre,
        sucursales_tipo,
        sucursales_calle,
        sucursales_numero,
        sucursales_latitud,
        sucursales_longitud,
        sucursales_observaciones,
        sucursales_barrio,
        sucursales_codigo_postal,
        sucursales_localidad,
        sucursales_provincia,
        sucursales_lunes_horario_atencion,
        sucursales_martes_horario_atencion,
        sucursales_miercoles_horario_atencion,
        sucursales_jueves_horario_atencion,
        sucursales_viernes_horario_atencion,
        sucursales_sabado_horario_atencion,
        sucursales_domingo_horario_atencion
      FROM read_csv('${file}',
        header=true, columns={
          'id_comercio': 'INTEGER',
          'id_bandera': 'INTEGER',
          'id_sucursal': 'INTEGER',
          'sucursales_nombre': 'TEXT',
          'sucursales_tipo': 'TEXT',
          'sucursales_calle': 'TEXT',
          'sucursales_numero': 'TEXT',
          'sucursales_latitud': 'DECIMAL(10,6)',
          'sucursales_longitud': 'DECIMAL(10,6)',
          'sucursales_observaciones': 'TEXT',
          'sucursales_barrio': 'TEXT',
          'sucursales_codigo_postal': 'TEXT',
          'sucursales_localidad': 'TEXT',
          'sucursales_provincia': 'TEXT',
          'sucursales_lunes_horario_atencion': 'TEXT',
          'sucursales_martes_horario_atencion': 'TEXT',
          'sucursales_miercoles_horario_atencion': 'TEXT',
          'sucursales_jueves_horario_atencion': 'TEXT',
          'sucursales_viernes_horario_atencion': 'TEXT',
          'sucursales_sabado_horario_atencion': 'TEXT',
          'sucursales_domingo_horario_atencion': 'TEXT'
        }
      )
    )
    INSERT INTO sucursales 
    SELECT
      id_comercio,
      id_bandera,
      id_sucursal,
      sucursales_nombre,
      sucursales_tipo,
      sucursales_calle,
      sucursales_numero,
      sucursales_latitud,
      sucursales_longitud,
      sucursales_observaciones,
      sucursales_barrio,
      sucursales_codigo_postal,
      sucursales_localidad,
      sucursales_provincia,
      sucursales_lunes_horario_atencion,
      sucursales_martes_horario_atencion,
      sucursales_miercoles_horario_atencion,
      sucursales_jueves_horario_atencion,
      sucursales_viernes_horario_atencion,
      sucursales_sabado_horario_atencion,
      sucursales_domingo_horario_atencion
    FROM cleaned_data;
    `);
  }

  async writeParquet(file: string) {
    await this.connection.run(`
    COPY sucursales TO '${file}' (FORMAT parquet, COMPRESSION zstd);
    `);
  }
}

class BanderasImporter {
  constructor(private connection: DuckDBConnection) {}

  async setupTable() {
    await this.connection.run(`
      CREATE TABLE banderas (
        id_comercio INTEGER,
        id_bandera INTEGER,
        comercio_cuit TEXT,
        comercio_razon_social TEXT,
        comercio_bandera_nombre TEXT,
        comercio_bandera_url TEXT,
        comercio_ultima_actualizacion TEXT,
        comercio_version_sepa TEXT,
        PRIMARY KEY (id_comercio, id_bandera)
      );
    `);
  }

  async importAndPatchCsv(file: string) {
    let csv = await readFile(file);
    csv = removeUltimaActualizacion(csv);
    await writeFile(file, csv);
    await this.connection.run(`
      COPY banderas FROM '${file}'
      (HEADER, FORMAT csv);
    `);
  }

  async writeParquet(file: string) {
    await this.connection.run(`
      COPY banderas TO '${file}' (FORMAT parquet, COMPRESSION zstd);
    `);
  }
}

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
  file = removeUltimaActualizacion(file);
  // file = file.replaceAll(/[ \t]*\n/g, "\n");
  await writeFile(join(dir, "productos.csv"), file);
}

function removeUltimaActualizacion(csv: string) {
  return csv.replace(/\r?\n(&#032;)?\0? *\r?\n"?[uúUÚÃÃ³].*/giu, "");
}

class PreciosImporter {
  constructor(private readonly connection: DuckDBConnection) {}

  async setupTable() {
    await this.connection.run(`
    CREATE TABLE precios (
      id_comercio INTEGER not null,
      id_bandera INTEGER not null,
      id_sucursal INTEGER not null,
      id_producto BIGINT not null,
      productos_ean INTEGER,
      --productos_descripcion TEXT,
      --productos_unidad_medida_presentacion TEXT,
      --productos_marca TEXT,
      productos_precio_lista DECIMAL(10,2),
      productos_precio_referencia DECIMAL(10,2),
      --productos_unidad_medida_referencia TEXT,
      --productos_precio_unitario_promo1 DECIMAL(10,2),
      --productos_leyenda_promo1 TEXT,
      --productos_precio_unitario_promo2 DECIMAL(10,2),
      --productos_leyenda_promo2 TEXT,
      CONSTRAINT unique_product_entry UNIQUE (id_comercio, id_bandera, id_sucursal, id_producto)
    );
    `);
  }

  async importProperCsv(file: string) {
    await this.connection.run(`
    WITH cleaned_data AS (
      SELECT
        id_comercio,
        id_bandera,
        id_sucursal,
        id_producto,
        productos_ean,
        productos_cantidad_presentacion,
        productos_unidad_medida_presentacion,
        productos_precio_lista,
        productos_precio_referencia,
        productos_cantidad_referencia,
        productos_unidad_medida_referencia,
        productos_precio_unitario_promo1,
        productos_leyenda_promo1,
        productos_precio_unitario_promo2,
        productos_leyenda_promo2
      FROM read_csv('${file}',
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
      productos_precio_lista,
      productos_precio_referencia
    FROM cleaned_data
    ORDER BY id_producto, id_sucursal, id_bandera, id_comercio;
    `);
    const metadataConn = await metadataInstance.connect();
    await metadataConn.run(`
    WITH cleaned_data AS (
      SELECT
        id_comercio,
        id_producto,
        REPLACE(TRIM(REPLACE(productos_descripcion, '\t', ' ')), '\t', ' ') AS productos_descripcion,
        TRIM(productos_marca) AS productos_marca,
        productos_unidad_medida_presentacion,
        productos_unidad_medida_referencia,
        productos_cantidad_presentacion,
        productos_cantidad_referencia
      FROM read_csv('${file}',
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
    INSERT INTO metadata
    SELECT
      id_comercio,
      id_producto,
      FIRST(productos_descripcion),
      FIRST(productos_marca),
      FIRST(productos_unidad_medida_presentacion),
      FIRST(productos_unidad_medida_referencia),
      FIRST(productos_cantidad_presentacion),
      FIRST(productos_cantidad_referencia)
    FROM cleaned_data
    GROUP BY id_comercio, id_producto
    ORDER BY id_producto
    ON CONFLICT (id_comercio, id_producto) DO NOTHING;
    `);
  }

  async writeParquet(file: string) {
    await this.connection.run(`
    COPY precios TO '${file}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 100000);
    `);
  }
}

async function importDump(dumpDir: string) {
  const glob = await fg("**/productos.csv", { cwd: dumpDir });
  let datasetNames: string[] = [];

  const instance = await DuckDBInstance.create(":memory:", {
    threads: "1",
  });
  const connection = await instance.connect();
  const preciosImporter = new PreciosImporter(connection);
  const banderasImporter = new BanderasImporter(connection);
  const sucursalesImporter = new SucursalesImporter(connection);
  await preciosImporter.setupTable();
  await banderasImporter.setupTable();
  await sucursalesImporter.setupTable();
  console.time("import");
  for (const file of glob) {
    const datasetDir = join(dumpDir, dirname(file));
    const datasetName = dirname(file);
    datasetNames.push(datasetName);

    console.log(datasetDir);

    try {
      await patchPreciosCsv(datasetDir);
      await preciosImporter.importProperCsv(join(datasetDir, "productos.csv"));
      await banderasImporter.importAndPatchCsv(
        join(datasetDir, "comercio.csv")
      );
      await sucursalesImporter.importAndPatchCsv(
        join(datasetDir, "sucursales.csv")
      );
    } catch (e) {
      if (e instanceof ExpectedDatasetError) {
        console.error(`👍 skipping ${datasetDir}:`, e.message);
      } else {
        console.error(`error importing ${datasetDir}:`, e);
      }
    }
  }

  const date = basename(datasetNames[0]).match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!date) throw new Error(`No se pudo extraer la fecha del dump ${dumpDir}`);

  await mkdir(date, { recursive: true });
  await preciosImporter.writeParquet(join(date, "precios.parquet"));
  await banderasImporter.writeParquet(join(date, "banderas.parquet"));
  await sucursalesImporter.writeParquet(join(date, "sucursales.parquet"));
  await writeFile(join(date, "datasets.txt"), datasetNames.join("\n"));
  connection.close();
  console.timeEnd("import");
}

async function importDatasetTar(tarPath: string) {
  console.log(`importing tar ${tarPath}`);
  const dir = await fs.mkdtemp("/tmp/sepa-precios-importer-");
  try {
    await execFile("tar", ["-x", "-C", dir, "-f", tarPath]);
    async function unzipRecursively(dir: string) {
      for (const file of await fs.readdir(dir)) {
        const path = join(dir, file);
        const stat = await fs.lstat(path);

        if (stat.isDirectory()) {
          await unzipRecursively(path);
        } else if (extname(file) === ".zip") {
          const extractDir = join(dir, basename(file, ".zip"));
          await fs.mkdir(extractDir, { recursive: true });
          await execFile("unzip", ["-d", extractDir, path]);
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

try {
  if (process.argv[2].startsWith("http")) {
    const res = await fetch(process.argv[2]);
    const json = await res.json();
    const Entry = z.object({
      id: z.string(),
      warnings: z.string(),
      name: z.string().optional(),
      link: z.string().optional(),
      firstSeenAt: z.coerce.date(),
    });
    const obj = z.record(z.string(), z.array(Entry)).parse(json);
    const newest = Object.values(obj).map(
      (v) =>
        v
          .filter(
            (v): v is z.infer<typeof Entry> & { name: string } => !!v.name
          )
          .sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime())[0]
    );
    const tasks = newest.map((v) => join(process.argv[3], v.name));
    const queue = new PQueue({ concurrency: cpus().length });
    const bar1 = new cliProgress.SingleBar(
      { forceRedraw: true },
      cliProgress.Presets.shades_classic
    );
    bar1.start(tasks.length, 0);
    await Promise.all(
      tasks.map((tar) =>
        queue.add(() => importDatasetTar(tar).finally(() => bar1.increment()))
      )
    );
  } else {
    const file = await stat(process.argv[2]);
    if (file.isDirectory()) {
      const tarGlob = await fg("**/*.tar.zst", { cwd: process.argv[2] });
      const tasks: string[] = tarGlob.map((f) => join(process.argv[2], f));
      if (tasks.length > 0) {
        const queue = new PQueue({ concurrency: cpus().length });

        const bar1 = new cliProgress.SingleBar(
          { forceRedraw: true },
          cliProgress.Presets.shades_classic
        );
        bar1.start(tasks.length, 0);

        await Promise.all(
          tasks.map((tar) =>
            queue.add(() =>
              importDatasetTar(tar).finally(() => bar1.increment())
            )
          )
        );
        bar1.stop();
      } else {
        await importDump(process.argv[2]);
      }
    } else {
      await importDatasetTar(process.argv[2]);
    }
  }
} finally {
}

{
  const conn = await metadataInstance.connect();
  await conn.run(`
    COPY metadata TO 'metadata.parquet' (FORMAT parquet, COMPRESSION zstd);
  `);
}
