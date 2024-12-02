// @ts-check

import * as fsp from "fs/promises";
import * as fs from "fs";
import { CsvParserStream, parse, parseString } from "fast-csv";
import { basename, join, dirname } from "path";
import { $ } from "zx";
import PQueue from "p-queue";
import { Database } from "duckdb-async";
import fg from "fast-glob";
import {
  DuckDBAppender,
  DuckDBConnection,
  DuckDBInstance,
} from "@duckdb/node-api";
import Papa from "papaparse";
import { writeFile } from "fs/promises";

// TODO: verificar que pasa cuando hay varios datasets del mismo día (como los suele haber cuando actualizan el dataset con nuevos comercios)
const instance = await DuckDBInstance.create("importer.db", {
  // threads: "1",
});

const queue = new PQueue({ concurrency: 4 });

let hasTars = false;
const files = await fg("**/*.tar.zst", { cwd: process.argv[2] });
for (const file of files) {
  hasTars = true;
  const tar = join(process.argv[2], file);
  queue.add(() => importDatasetTar(tar));
}
await queue.onIdle();

if (!hasTars) {
  await importDump(process.argv[2]);
}

/**
 * @param {DuckDBConnection} connection
 * @param {number} datasetId
 * @param {string} dir
 */
async function importSucursales(connection, datasetId, dir) {
  const stream = await createReadStream(join(dir, "sucursales.csv"));
  const appender = await connection.createAppender("main", "sucursales");

  stream
    .pipe(
      parse({ headers: true, delimiter: "|", ignoreEmpty: true, trim: true })
    )
    .on("data", (data) => {
      if (!data.id_comercio || !data.id_bandera || !data.id_sucursal) {
        return;
      }
      if (data.sucursales_domingohorario_atencion) {
        data.sucursales_domingo_horario_atencion =
          data.sucursales_domingohorario_atencion;
        delete data.sucursales_domingohorario_atencion;
      }
      data.sucursales_nombre = data.sucursales_nombre
        .replaceAll("\t", " ")
        .trim();

      if (!("sucursales_longitud" in data)) {
        console.debug({ data });
        throw new Error(
          "Alberdi S.A. strikes again! las sucursales están rotas."
        );
      }
      appender.appendInteger(datasetId);
      appender.appendInteger(parseInt(data.id_comercio));
      appender.appendInteger(parseInt(data.id_bandera));
      appender.appendInteger(parseInt(data.id_sucursal));
      appender.appendVarchar(data.sucursales_nombre);
      appender.appendVarchar(data.sucursales_tipo);
      appender.appendVarchar(data.sucursales_calle);
      appender.appendVarchar(data.sucursales_numero);
      /** @type {[number, number]} */
      let [lat, lon] = [
        parseFloat(data.sucursales_latitud),
        parseFloat(data.sucursales_longitud),
      ];
      if (isNaN(lat) || isNaN(lon)) {
        appender.appendNull();
        appender.appendNull();
      } else {
        appender.appendDouble(lat);
        appender.appendDouble(lon);
      }
      appender.appendVarchar(data.sucursales_observaciones);
      appender.appendVarchar(data.sucursales_barrio);
      appender.appendVarchar(data.sucursales_codigo_postal);
      appender.appendVarchar(data.sucursales_localidad);
      appender.appendVarchar(data.sucursales_provincia);
      appender.appendVarchar(data.sucursales_lunes_horario_atencion);
      appender.appendVarchar(data.sucursales_martes_horario_atencion);
      appender.appendVarchar(data.sucursales_miercoles_horario_atencion);
      appender.appendVarchar(data.sucursales_jueves_horario_atencion);
      appender.appendVarchar(data.sucursales_viernes_horario_atencion);
      appender.appendVarchar(data.sucursales_sabado_horario_atencion);
      appender.appendVarchar(data.sucursales_domingo_horario_atencion);
      appender.endRow();
    })
    .on("error", (err) => {
      console.error(err);
    });
  await new Promise((resolve) => stream.on("end", resolve));
  await appender.close();
}

/**
 * @param {DuckDBConnection} connection
 * @param {number} datasetId
 * @param {string} dir
 */
async function importBanderas(connection, datasetId, dir) {
  const stream = await createReadStream(join(dir, "comercio.csv"));
  const appender = await connection.createAppender("main", "banderas");

  stream
    .pipe(
      parse({ headers: true, delimiter: "|", ignoreEmpty: true, trim: true })
    )
    .on("data", (data) => {
      if (!data.id_comercio || !data.id_bandera) return;

      appender.appendInteger(datasetId);
      appender.appendInteger(parseInt(data.id_comercio));
      appender.appendInteger(parseInt(data.id_bandera));
      appender.appendVarchar(data.comercio_cuit);
      appender.appendVarchar(data.comercio_razon_social);
      appender.appendVarchar(data.comercio_bandera_nombre);
      appender.appendVarchar(data.comercio_bandera_url);
      appender.appendVarchar(data.comercio_ultima_actualizacion);
      appender.appendVarchar(data.comercio_version_sepa);
      appender.endRow();
    })
    .on("error", (err) => {
      console.error(err);
    });
  await new Promise((resolve) => stream.on("end", resolve));
  await appender.close();
}

/**
 * @param {DuckDBConnection} connection
 * @param {number} datasetId
 * @param {string} dir
 */
async function importPrecios(connection, datasetId, dir) {
  const { comercioCuit } = await getComercioMetadata(dir);
  if (
    [
      "30707429468",
      "30589621499",
      "30663005843",
      // Alberdi S.A. -- escriben id_producto en formato 7,790127e+012
      "30578411174",
    ].includes(comercioCuit)
  ) {
    // TODO: si tienen los valores, pero con otros nombres, por ejemplo
    // productos_precio_lista seria precio_unitario_bulto_por_unidad_venta_con_iva.
    // pero no quiero mentir, asi que por ahora no lo importo
    throw new Error(
      `No voy a importar el dataset ${dir} porque el formato está mal. Pero se podría importar. Pero por ahora no lo voy a hacer. Véase https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b`
    );
  }

  if (comercioCuit == "30543659734") {
    throw new Error("Megatone envia archivos vacios que dicen 'error'. lol.");
  }

  const sourceCsvPath = join(dir, "productos.csv");

  const temp = await fsp.mkdtemp("/tmp/sepa-precios-importer-csv-cleaner-");
  try {
    const fixedCsvPath = join(temp, "productos.csv");

    // /** @type {CsvParserStream<any,any>} */
    // let csvStream;

    // const appender = await connection.createAppender("main", "precios");

    if (comercioCuit == "30612929455") {
      // Libertad S.A.
      const file = (await readFile(sourceCsvPath))
        .replaceAll("|RAPTOR 6X16X45", "/RAPTOR 6X16X45")
        .replace(/\r?\n *\r?\n[uúUÚÃ]/giu, "");
      await writeFile(fixedCsvPath, file);
    } else if (comercioCuit == "30578411174") {
      // Alberdi S.A.
      const file = (await readFile(sourceCsvPath)).replaceAll(";", "|");
      await writeFile(fixedCsvPath, file);
      // TODO: remove ultima actualizacion
    } else {
      let file = await readFile(sourceCsvPath);
      file = file.replace(/\r?\n(&#032;)?\0? *\r?\n"?[uúUÚ]/giu, "");
      file = file.replaceAll(/[ \t]*\n/g, "\n");
      await writeFile(fixedCsvPath, file);
    }

    const sql = `insert into precios select ${datasetId} as id_dataset, * from read_csv('${fixedCsvPath}', delim='|', header=true, nullstr='')`;
    console.debug("sql", sql);
    await connection.run(sql);
    await fsp.rm(temp, { recursive: true });
  } finally {
  }
}

/**
 * @param {string} dir
 */
async function importDataset(dir) {
  console.log(dir);
  const date = basename(dir).match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const id_comercio = basename(dir).match(/comercio-sepa-(\d+)/)?.[1];
  // TODO: parsear "Ultima actualizacion" al final del CSV y insertarlo en la tabla datasets

  const connection = await instance.connect();

  await connection.run("begin transaction");
  try {
    const res = await connection.run(
      `insert into datasets (id, name, date, id_comercio) values (nextval('seq_datasets'), '${basename(dir)}', '${date}', ${id_comercio}) returning id`
    );
    const rows = await res.getRows();
    if (!rows[0][0]) throw new Error("No se pudo insertar el dataset");

    console.log("inserted dataset");
    const datasetId = parseInt(rows[0][0].toString());

    const comercios = Papa.parse(await readFile(join(dir, "comercio.csv")), {
      header: true,
    });
    const comercioCuit = comercios.data[0].comercio_cuit;
    console.log(`dataset ${datasetId}, comercio ${comercioCuit}`);

    await importBanderas(connection, datasetId, dir);
    await importSucursales(connection, datasetId, dir);
    await importPrecios(connection, datasetId, dir);

    await connection.run("commit");
  } catch (e) {
    // @ts-ignore
    if (e.message.includes("Constraint Error: Duplicate key")) {
      console.log(`dataset ${basename(dir)} already exists`);
      await connection.run("abort");
      return;
    }
    console.error("errored, aborting transaction", e);
    await connection.run("abort");
  } finally {
    // await connection.run("CHECKPOINT");
    try {
      Bun.gc(true);
    } catch {}
  }
}

/**
 * @param {string} tarPath
 */
async function importDatasetTar(tarPath) {
  console.log(`importing tar ${tarPath}`);
  const dir = await fsp.mkdtemp("/tmp/sepa-precios-importer-");
  try {
    await $`tar -x -C ${dir} -f ${tarPath}`;
    await importDump(dir);
  } finally {
    await fsp.rm(dir, { recursive: true });
  }
}

/**
 * @param {string} dumpDir
 */
async function importDump(dumpDir) {
  const files = await fg("**/productos.csv", { cwd: dumpDir });
  for (const file of files) {
    const dir = join(dumpDir, dirname(file));
    await importDataset(dir);
  }
}

/**
 * @param {string} dir
 */
async function getComercioMetadata(dir) {
  const comercios = Papa.parse(await readFile(join(dir, "comercio.csv")), {
    header: true,
  });
  const comercioCuit = comercios.data[0].comercio_cuit;
  return { comercioCuit };
}

// -----------
// tenemos que detectar si el archivo es UTF-16 o UTF-8
// porque DORINKA SRL a veces envía archivos con UTF-16.
// ------------

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
async function readFile(path) {
  const buffer = await fsp.readFile(path, { encoding: null });
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le");
  } else {
    return buffer.toString("utf8");
  }
}

/**
 * @param {string} path
 * @returns {Promise<fs.ReadStream>}
 */
async function createReadStream(path) {
  const chunks = [];
  for await (let chunk of fs.createReadStream(path, { start: 0, end: 1 })) {
    chunks.push(chunk);
  }
  const header = Buffer.concat(chunks);
  if (header[0] === 0xff && header[1] === 0xfe) {
    return fs.createReadStream(path, { encoding: "utf16le" });
  } else {
    return fs.createReadStream(path, { encoding: "utf8" });
  }
}
