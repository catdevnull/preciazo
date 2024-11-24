// @ts-check

import * as fs from "fs/promises";
import Papa from "papaparse";
import { basename, join, dirname } from "path";
import { $ } from "zx";
import PQueue from "p-queue";
import { Database } from "duckdb-async";
import fg from "fast-glob";
// import { waddler } from "waddler";

// TODO: verificar que pasa cuando hay varios datasets del mismo día (como los suele haber cuando actualizan el dataset con nuevos comercios)

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
async function readFile(path) {
  // XXX: DORINKA SRL a veces envía archivos con UTF-16.
  const buffer = await fs.readFile(path, { encoding: null });
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le");
  } else {
    return buffer.toString("utf8");
  }
}

/**
 * @param {Database} db
 * @param {number} datasetId
 * @param {string} dir
 */
async function importSucursales(db, datasetId, dir) {
  const sucursales = Papa.parse(await readFile(join(dir, "sucursales.csv")), {
    header: true,
  });

  const objs = sucursales.data
    .filter((data) => data.id_comercio && data.id_bandera && data.id_sucursal)
    .map((data) => {
      // Megatone
      if ("sucursales_domingohorario_atencion" in data) {
        data.sucursales_domingo_horario_atencion =
          data.sucursales_domingohorario_atencion;
        delete data.sucursales_domingohorario_atencion;
      }
      data.sucursales_nombre = data.sucursales_nombre
        .replaceAll("\t", " ")
        .trim();
      return {
        id_dataset: datasetId,
        ...data,
      };
    });
  const keys = Object.keys(objs[0]);
  if (!keys.includes("sucursales_longitud")) {
    throw new Error("Alberdi S.A. strikes again! las sucursales están rotas.");
  }
  const lines = objs.map(
    (data) => keys.map((key) => data[key]).join("\t") + "\n"
  );

  const tsv = `${keys.join("\t")}\n${lines.join("")}`;
  await importTsv(db, "sucursales", tsv);
}

/**
 * @param {Database} db
 * @param {string} table
 * @param {string} tsv
 */
async function importTsv(db, table, tsv) {
  const dir = await fs.mkdtemp("/tmp/sepa-precios-importer-");
  try {
    const tempFile = join(dir, "temp.tsv");
    await fs.writeFile(tempFile, tsv);
    console.log(
      `COPY ${table} FROM '${tempFile}' WITH (HEADER, DELIMITER '\t', NULL '', QUOTE '')`
    );
    await db.exec(
      `COPY ${table} FROM '${tempFile}' WITH (HEADER, DELIMITER '\t', NULL '', QUOTE '')`
    );
    await fs.rm(dir, { recursive: true });
  } finally {
  }
}

/**
 * @param {Database} db
 * @param {number} datasetId
 * @param {string} dir
 */
async function importBanderas(db, datasetId, dir) {
  const banderas = Papa.parse(await readFile(join(dir, "comercio.csv")), {
    header: true,
  });
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
  const lines = objs
    .filter((data) => data.id_comercio && data.id_bandera)
    .map((data) =>
      keys
        .map((key) => {
          const value = data[key];
          if (typeof value !== "string") {
            return value;
          }
          return value.replaceAll("\t", " ").trim();
        })
        .join("\t")
    );
  const tsv = `${keys.join("\t")}\n${lines.join("\n")}`;

  await importTsv(db, "banderas", tsv);
}

/**
 * @param {string} dir
 */
async function importDataset(dir) {
  console.log(dir);
  const date = basename(dir).match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const id_comercio = basename(dir).match(/comercio-sepa-(\d+)/)?.[1];
  // TODO: parsear "Ultima actualizacion" al final del CSV y insertarlo en la tabla datasets

  const db = await Database.create("importer.db");

  try {
    await db.exec("begin transaction");
    let datasetId;
    const res = await db.all(
      `insert into datasets (id, name, date, id_comercio) values (nextval('seq_datasets'), '${basename(dir)}', '${date}', ${id_comercio}) returning id`
    );
    console.log("inserted dataset");
    datasetId = res[0].id;

    const comercios = Papa.parse(await readFile(join(dir, "comercio.csv")), {
      header: true,
    });
    const comercioCuit = comercios.data[0].comercio_cuit;
    console.log(`dataset ${datasetId}, comercio ${comercioCuit}`);

    await importBanderas(db, datasetId, dir);
    await importSucursales(db, datasetId, dir);

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

    const parsedData = Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
    });
    const objs = parsedData.data
      .filter(
        (data) =>
          data.id_comercio &&
          data.id_bandera &&
          data.id_sucursal &&
          data.id_producto
      )
      .map((data) => {
        delete data.id_dun_14;
        return {
          id_dataset: datasetId,
          ...data,
          productos_descripcion: data.productos_descripcion
            .replaceAll("\t", " ")
            .trim(),
          productos_marca: data.productos_marca.trim(),
        };
      });

    const keys = [
      "id_dataset",
      "id_comercio",
      "id_bandera",
      "id_sucursal",
      "id_producto",
      "productos_ean",
      "productos_descripcion",
      "productos_cantidad_presentacion",
      "productos_unidad_medida_presentacion",
      "productos_marca",
      "productos_precio_lista",
      "productos_precio_referencia",
      "productos_cantidad_referencia",
      "productos_unidad_medida_referencia",
      "productos_precio_unitario_promo1",
      "productos_leyenda_promo1",
      "productos_precio_unitario_promo2",
      "productos_leyenda_promo2",
    ];

    const lines = objs.map(
      (data) => keys.map((key) => data[key]).join("\t") + "\n"
    );

    const tsv = `${keys.join("\t")}\n${lines.join("")}`;
    await importTsv(db, "precios", tsv);

    console.timeEnd("parse");
    await db.exec("commit");
    console.info(`saved ${objs.length} rows`);
  } catch (e) {
    // @ts-ignore
    if (e.errorType == "Constraint") {
      console.log(`dataset ${basename(dir)} already exists`);
      await db.exec("abort");
      return;
    }
    console.error("errored, aborting transaction", e);
    await db.exec("abort");
  } finally {
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
  const dir = await fs.mkdtemp("/tmp/sepa-precios-importer-");
  try {
    await $`tar -x -C ${dir} -f ${tarPath}`;
    await importDump(dir);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
}

/**
 * @param {string} dumpDir
 */
async function importDump(dumpDir) {
  const pQueue = new PQueue({ concurrency: 1 });
  const files = await fg("**/productos.csv", { cwd: dumpDir });
  for (const file of files) {
    const dir = join(dumpDir, dirname(file));
    pQueue.add(() => importDataset(dir));
  }
  await pQueue.onIdle();
}

let hasTars = false;
const files = await fg("**/*.tar.zst", { cwd: process.argv[2] });
for (const file of files) {
  hasTars = true;
  const tar = join(process.argv[2], file);
  await importDatasetTar(tar);
}

if (!hasTars) {
  await importDump(process.argv[2]);
}
