import * as fs from "fs/promises";
import { createWriteStream } from "fs";
import Papa from "papaparse";
import { basename, join, dirname } from "path";
import postgres from "postgres";
import { Readable } from "stream";
import { pipeline } from "node:stream/promises";
import { Glob } from "bun";

const sql = postgres({
  database: "sepa-precios",
});

// await sql`
// drop table if exists precios;`;
// await sql`
// drop table if exists datasets;`;
await sql`
  CREATE TABLE if not exists datasets (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE,
      date DATE
  );`;
await sql`
    CREATE TABLE if not exists sucursales (
        id_dataset INTEGER REFERENCES datasets(id),
        id_comercio INTEGER,
        id_bandera INTEGER,
        id_sucursal INTEGER,
        sucursales_nombre TEXT,
        sucursales_tipo TEXT,
        sucursales_calle TEXT,
        sucursales_numero TEXT,
        sucursales_latitud NUMERIC,
        sucursales_longitud NUMERIC,
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
        UNIQUE (id_dataset, id_comercio, id_bandera, id_sucursal)
    );`;
await sql`
  CREATE TABLE if not exists precios (
      id_dataset INTEGER REFERENCES datasets(id),
      id_comercio INTEGER,
      id_bandera INTEGER,
      id_sucursal INTEGER,
      id_producto BIGINT,
      productos_ean INTEGER,
      productos_descripcion TEXT,
      productos_cantidad_presentacion NUMERIC(10, 2),
      productos_unidad_medida_presentacion TEXT,
      productos_marca TEXT,
      productos_precio_lista NUMERIC(10, 2),
      productos_precio_referencia NUMERIC(10, 2),
      productos_cantidad_referencia NUMERIC(10, 2),
      productos_unidad_medida_referencia TEXT,
      productos_precio_unitario_promo1 NUMERIC(10, 2),
      productos_leyenda_promo1 TEXT,
      productos_precio_unitario_promo2 NUMERIC(10, 2),
      productos_leyenda_promo2 TEXT
  );
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_precios_composite ON precios (id_dataset, id_comercio, id_bandera, id_sucursal, id_producto);
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_sucursales_composite ON sucursales (id_dataset, id_comercio, id_bandera, id_sucursal);
`;

async function importSucursales(
  sql: postgres.Sql,
  datasetId: number,
  dir: string
) {
  const sucursales: Papa.ParseResult<any> = Papa.parse(
    await fs.readFile(join(dir, "sucursales.csv"), "utf-8"),
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

async function importDataset(dir: string) {
  const date = basename(dir).match(/(\d{4}-\d{2}-\d{2})/)![1];
  // TODO: parsear "Ultima actualizacion" al final del CSV y insertarlo en la tabla datasets

  // {
  //   const res =
  //     await sql`select id from datasets where name = ${basename(dir)}`;
  //   await importSucursales(sql, res[0].id, dir);
  // }

  try {
    await sql.begin(async (sql) => {
      let datasetId: number;
      const res =
        await sql`insert into datasets (name, date) values (${basename(dir)}, ${date}) returning id`;
      datasetId = res[0].id;

      const comercios: Papa.ParseResult<{ comercio_cuit: string }> = Papa.parse(
        await fs.readFile(join(dir, "comercio.csv"), "utf-8"),
        { header: true }
      );
      const comercioCuit = comercios.data[0].comercio_cuit;
      console.log(`dataset ${datasetId}, comercio ${comercioCuit}`);

      await importSucursales(sql, datasetId, dir);

      let file = await fs.readFile(join(dir, "productos.csv"), "utf-8");
      // WALL OF SHAME: estos proveedores no saben producir CSVs correctos
      if (comercioCuit == "30612929455") {
        // Libertad S.A.
        file = file.replaceAll("|RAPTOR 6X16X45", "/RAPTOR 6X16X45");
      } else if (comercioCuit == "30578411174") {
        // Alberdi S.A.
        file = file.replaceAll(";", "|");
      }
      if (
        ["33504047089", "30707429468", "30589621499"].includes(comercioCuit)
      ) {
        // TODO: si tienen los valores, pero con otros nombres, por ejemplo
        // productos_precio_lista seria precio_unitario_bulto_por_unidad_venta_con_iva.
        // pero no quiero mentir, asi que por ahora no lo importo
        console.error(
          `No voy a importar el dataset ${dir} porque el formato está mal. Pero se podría importar. Pero por ahora no lo voy a hacer. Véase https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b`
        );
        return;
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

try {
  const glob = new Glob("**/productos.csv");
  for await (const file of glob.scan(process.argv[2])) {
    const dir = join(process.argv[2], dirname(file));
    console.log(dir);
    await importDataset(dir);
  }
} finally {
  await sql.end();
}
