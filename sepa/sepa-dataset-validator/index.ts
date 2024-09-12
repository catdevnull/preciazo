import * as fs from "fs";
import { join } from "path";
import jschardet from "jschardet";
import Papa from "papaparse";
import { Comerico, ProductoSegúnSpec } from "./schemas";
import { ISO_PROVINCIAS } from "./consts";

const dir = process.argv[2];

if (!dir) {
  console.error("Usage: bun index.ts <directory>");
  process.exit(1);
}

async function readFiles(dir: string) {
  const buffers = {
    "productos.csv": await fs.promises.readFile(join(dir, "productos.csv")),
    "sucursales.csv": await fs.promises.readFile(join(dir, "sucursales.csv")),
    "comercio.csv": await fs.promises.readFile(join(dir, "comercio.csv")),
  };

  let texts: Record<keyof typeof buffers, string> = {
    "productos.csv": "",
    "sucursales.csv": "",
    "comercio.csv": "",
  };

  let notUtf8 = [];
  for (const [name, buffer] of Object.entries(buffers)) {
    const det = jschardet.detect(buffer.subarray(0, 1024 * 1024));
    if (det.encoding === "ascii") det.encoding = "UTF-8";
    if (det.encoding !== "UTF-8") {
      notUtf8.push(name);
      if (det.encoding === "UTF-16LE") {
        texts[name as keyof typeof buffers] = buffer.toString("utf-16le");
      } else throw new Error(`Can't parse encoding ${det.encoding} in ${name}`);
    } else {
      texts[name as keyof typeof buffers] = buffer.toString("utf-8");
    }
  }
  if (notUtf8.length > 0) {
    console.error(`❌ No son UTF-8: ${notUtf8.join(", ")}`);
  }

  if (texts["productos.csv"].includes("\t")) {
    console.error(`❌ El archivo productos.csv contiene tabs`);
  }

  // XXX: cada uno tiene su interpretación de que tildes tiene cada palabra...
  // vi varias combinaciones de tildes y sin tildes en los archivos de los datasets
  // estaría bueno chequearlo para verificar que está según spec
  const regex =
    /(?:\r?\n *)?\r?\n(?:[ÚU]ltima actualizaci[oó]n): (.+)(?:\r?\n)*$/iu;
  for (const [name, text] of Object.entries(texts)) {
    const matches = text.match(regex);
    if (!matches) {
      console.error(`❌ [${name}] No pude encontrar la fecha de actualización`);
    } else {
      texts[name as keyof typeof buffers] = text.replace(regex, "");
    }
  }

  const csvs = {
    "productos.csv": Papa.parse(texts["productos.csv"], {
      header: true,
    }),
    "sucursales.csv": Papa.parse(texts["sucursales.csv"], {
      header: true,
    }),
    "comercio.csv": Papa.parse(texts["comercio.csv"], {
      header: true,
    }),
  };

  const comercio = Comerico.parse(csvs["comercio.csv"].data[0]);
  console.log(
    `  -> CUIT ${comercio.comercio_cuit}: ${comercio.comercio_razon_social}`
  );
  if (Object.values(csvs).some((csv) => csv.errors.length > 0)) {
    console.error(`❌ Hubo errores parseando el CSV`);
  }
  return csvs;
}

type Files = Awaited<ReturnType<typeof readFiles>>;

// si retorna truthy es un error
const checkers: Record<string, (files: Files) => boolean | string> = {
  ["[productos.csv] Nombres de columnas incorrectas"](files) {
    const firstRow = files["productos.csv"].data[0];
    if (!firstRow) return true;
    const res = ProductoSegúnSpec.safeParse(firstRow);
    if (res.error) {
      for (const [key, value] of Object.entries(res.error.format())) {
        if (!value) continue;
        const errors = Array.isArray(value) ? value : value._errors;
        console.error(`    Error en columna ${key}:`, errors.join(", "));
      }
      return true;
    }
    return false;
  },
  ["Sucursales mencionadas en productos.csv existen en sucursales.csv"](files) {
    const productos = new Set(
      files["productos.csv"].data.map((row) => (row as any).id_sucursal)
    );
    const sucursales = new Set(
      files["sucursales.csv"].data.map((row) => (row as any).id_sucursal)
    );
    const missing = [...productos].filter((id) => !sucursales.has(id));
    if (missing.length > 0) {
      console.error(
        `    Las sucursales ${missing.join(", ")} no existen en sucursales.csv`
      );
    }
    return missing.length > 0;
  },
  ["Hay productos duplicados con el mismo EAN"](files) {
    const productosEnSucursales = files["productos.csv"].data
      .filter((row: any) => row.productos_ean == 1)
      .map(
        (row: any) => `${row.id_bandera}-${row.id_sucursal}-${row.id_producto}`
      );
    const eansUnicos = new Set(productosEnSucursales);
    if (productosEnSucursales.length !== eansUnicos.size) return true;
    return false;
  },
  ["[sucursales.csv] sucursales_provincia no cumple con ISO 3166-2"](files) {
    const sucursales = files["sucursales.csv"].data;
    for (const sucursal of sucursales) {
      const prov = (sucursal as any).sucursales_provincia;
      if (!prov) continue;
      if (!ISO_PROVINCIAS.includes(prov)) {
        console.error(`    La provincia ${prov} no es válida`);
        return true;
      }
    }
    return false;
  },
};

const content = await fs.promises.readdir(dir);

if (content.find((x) => x.endsWith(".csv"))) {
  await chequearDataset(dir);
} else if (content.find((x) => x.startsWith("sepa"))) {
  for (const subdir of content) {
    if (!subdir.startsWith("sepa")) continue;
    console.info(`chequeando ${subdir}...`);
    await chequearDataset(join(dir, subdir));
  }
}

async function chequearDataset(dir: string) {
  const files = await readFiles(dir);

  for (const [name, checker] of Object.entries(checkers)) {
    try {
      const res = checker(files);
      if (res) {
        console.error(`❌ ${name} (${res})`);
      }
    } catch (error) {
      console.error(`❌ ${name}:`, error);
    }
  }
}

console.error(`¡Haga patria, arregle su dataset!`);
