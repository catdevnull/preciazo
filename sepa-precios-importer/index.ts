import { readFile } from "fs/promises";
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

async function importDataset(dir: string) {
  const date = basename(dir).match(/(\d{4}-\d{2}-\d{2})/)![1];
  // TODO: parsear "Ultima actualizacion" al final del CSV y insertarlo en la tabla datasets

  return await sql.begin(async () => {
    let datasetId: number;
    try {
      const res =
        await sql`insert into datasets (name, date) values (${basename(dir)}, ${date}) returning id`;
      datasetId = res[0].id;
    } catch (e) {
      if ((e as any).code == "23505") {
        console.log(`dataset ${basename(dir)} already exists`);
        return;
      }
      throw e;
    }
    const datas: any[] = [];

    const comercios: Papa.ParseResult<{ comercio_cuit: string }> = Papa.parse(
      await readFile(join(dir, "comercio.csv"), "utf-8"),
      { header: true },
    );
    const comercioCuit = comercios.data[0].comercio_cuit;
    console.log(`dataset ${datasetId}, comercio ${comercioCuit}`);

    let file = await readFile(join(dir, "productos.csv"), "utf-8");
    // WALL OF SHAME: estos proveedores no saben producir CSVs correctos
    if (comercioCuit == "30612929455") {
      // Libertad S.A.
      file = file.replaceAll("|RAPTOR 6X16X45", "/RAPTOR 6X16X45");
    } else if (comercioCuit == "30578411174") {
      // Alberdi S.A.
      file = file.replaceAll(";", "|");
    }
    if (["33504047089", "30707429468", "30589621499"].includes(comercioCuit)) {
      // TODO: si tienen los valores, pero con otros nombres, por ejemplo
      // productos_precio_lista seria precio_unitario_bulto_por_unidad_venta_con_iva.
      // pero no quiero mentir, asi que por ahora no lo importo
      console.error(
        `No voy a importar el dataset ${dir} porque el formato está mal. Pero se podría importar. Pero por ahora no lo voy a hacer. Véase https://gist.github.com/catdevnull/587d5c63c4bab11b9798861c917db93b`,
      );
      return;
    }
    console.time("parse");
    return await new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        step: function (result: any) {
          const { data } = result;
          if (
            data.id_comercio &&
            data.id_bandera &&
            data.id_sucursal &&
            data.id_producto
          )
            datas.push(data);
        },
        complete: async function () {
          try {
            console.timeEnd("parse");
            console.time("map");
            const objs = datas.map((data) => {
              delete data.id_dun_14;
              return {
                id_dataset: datasetId,
                ...data,
                productos_descripcion: data.productos_descripcion.replaceAll(
                  "\t",
                  " ",
                ),
              };
            });
            if (!objs.length) {
              console.error(`No hay datos para el dataset ${dir}`);
              return;
            }
            const keys = Object.keys(objs[0]);
            const lines = Readable.from(
              objs.map(
                (data) => keys.map((key) => data[key]).join("\t") + "\n",
              ),
            );
            console.timeEnd("map");
            console.time("copy");
            const writable =
              await sql`copy precios (${sql.unsafe(keys.join(", "))}) from stdin with CSV DELIMITER E'\t' QUOTE E'\b'`.writable();
            await pipeline(lines, writable);
            console.timeEnd("copy");
            console.info(`saved ${objs.length} rows`);
          } catch (e) {
            reject(e);
            return;
          } finally {
            Bun.gc(true);
            resolve(void 0);
          }
        },
        skipEmptyLines: true,
      });
    });
  });
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
