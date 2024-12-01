// @ts-check
import { DuckDBInstance } from "@duckdb/node-api";

const instance = await DuckDBInstance.create("../importer.db", {});

const connection = await instance.connect();

const eans = [
  //Maní Pelado Frito Salado Krachitos 70 grm
  7794520868983,
  //- 72896 registros - 4 cadenas

  //Yerba Mate 4 Flex Taragui 500 gr
  7790387013627, // - 93378 registros - 16 cadenas

  //Azúcar Superior Real Ledesma 1kg
  7792540250450, // - 72192 registros -
  // Se podrían sumar la azucar comuna que tiene menos registros y completa baches de distrib geogr: 7792540260138 (7843  registros)

  //Miel Liquida Aleluya 470 gr
  7790158229516, // - 73344 registros -  6 cadenas

  //Polenta Prestopronta 490g
  7790580138738, // - 81258 registros -  9 cadenas
];

for (const ean of eans) {
  await connection.run(`
COPY (
  select d.id, s.id_comercio, s.id_bandera, s.id_sucursal, p.productos_precio_lista, s.sucursales_provincia, s.sucursales_latitud, s.sucursales_longitud, d."date" from precios p
  join sucursales s 
  on p.id_dataset = s.id_dataset and p.id_sucursal = s.id_sucursal and p.id_comercio = s.id_comercio and p.id_bandera  = s.id_bandera 
  join datasets d
  on p.id_dataset = d.id 
  where p.id_producto = ${ean} -- and d.date = '2024-11-19'
) TO '${ean}.csv' (HEADER, DELIMITER ',');
`);
}
