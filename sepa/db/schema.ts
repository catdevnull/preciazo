import { max, relations, sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  bigint,
  text,
  numeric,
  unique,
  serial,
  date,
  index,
  pgMaterializedView,
  pgView,
} from "drizzle-orm/pg-core";

export const datasets = pgTable(
  "datasets",
  {
    id: serial("id").primaryKey().notNull(),
    name: text("name"),
    date: date("date"),
    id_comercio: integer("id_comercio"),
  },
  (table) => {
    return {
      datasets_name_key: unique("datasets_name_key").on(table.name),
    };
  }
);

export const precios = pgTable(
  "precios",
  {
    id_dataset: integer("id_dataset").references(() => datasets.id),
    id_comercio: integer("id_comercio"),
    id_bandera: integer("id_bandera"),
    id_sucursal: integer("id_sucursal"),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    id_producto: bigint("id_producto", { mode: "bigint" }),
    productos_ean: integer("productos_ean"),
    productos_descripcion: text("productos_descripcion"),
    productos_cantidad_presentacion: numeric(
      "productos_cantidad_presentacion",
      {
        precision: 10,
        scale: 2,
      }
    ),
    productos_unidad_medida_presentacion: text(
      "productos_unidad_medida_presentacion"
    ),
    productos_marca: text("productos_marca"),
    productos_precio_lista: numeric("productos_precio_lista", {
      precision: 10,
      scale: 2,
    }),
    productos_precio_referencia: numeric("productos_precio_referencia", {
      precision: 10,
      scale: 2,
    }),
    productos_cantidad_referencia: numeric("productos_cantidad_referencia", {
      precision: 10,
      scale: 2,
    }),
    productos_unidad_medida_referencia: text(
      "productos_unidad_medida_referencia"
    ),
    productos_precio_unitario_promo1: numeric(
      "productos_precio_unitario_promo1",
      {
        precision: 10,
        scale: 2,
      }
    ),
    productos_leyenda_promo1: text("productos_leyenda_promo1"),
    productos_precio_unitario_promo2: numeric(
      "productos_precio_unitario_promo2",
      {
        precision: 10,
        scale: 2,
      }
    ),
    productos_leyenda_promo2: text("productos_leyenda_promo2"),
  },
  (table) => {
    return {
      idx_precios_id_producto: index("idx_precios_id_producto").using(
        "btree",
        table.id_producto
      ),
      idx_precios_id_producto_id_dataset: index(
        "idx_precios_id_producto_id_dataset"
      ).using("btree", table.id_producto, table.id_dataset),
    };
  }
);

export const sucursales = pgTable(
  "sucursales",
  {
    id_dataset: integer("id_dataset").references(() => datasets.id),
    id_comercio: integer("id_comercio"),
    id_bandera: integer("id_bandera"),
    id_sucursal: integer("id_sucursal"),
    sucursales_nombre: text("sucursales_nombre"),
    sucursales_tipo: text("sucursales_tipo"),
    sucursales_calle: text("sucursales_calle"),
    sucursales_numero: text("sucursales_numero"),
    sucursales_latitud: numeric("sucursales_latitud"),
    sucursales_longitud: numeric("sucursales_longitud"),
    sucursales_observaciones: text("sucursales_observaciones"),
    sucursales_barrio: text("sucursales_barrio"),
    sucursales_codigo_postal: text("sucursales_codigo_postal"),
    sucursales_localidad: text("sucursales_localidad"),
    sucursales_provincia: text("sucursales_provincia"),
    sucursales_lunes_horario_atencion: text(
      "sucursales_lunes_horario_atencion"
    ),
    sucursales_martes_horario_atencion: text(
      "sucursales_martes_horario_atencion"
    ),
    sucursales_miercoles_horario_atencion: text(
      "sucursales_miercoles_horario_atencion"
    ),
    sucursales_jueves_horario_atencion: text(
      "sucursales_jueves_horario_atencion"
    ),
    sucursales_viernes_horario_atencion: text(
      "sucursales_viernes_horario_atencion"
    ),
    sucursales_sabado_horario_atencion: text(
      "sucursales_sabado_horario_atencion"
    ),
    sucursales_domingo_horario_atencion: text(
      "sucursales_domingo_horario_atencion"
    ),
  },
  (table) => {
    return {
      sucursales_id_dataset_id_comercio_id_bandera_id_sucursal_key: unique(
        "sucursales_id_dataset_id_comercio_id_bandera_id_sucursal_key"
      ).on(
        table.id_dataset,
        table.id_comercio,
        table.id_bandera,
        table.id_sucursal
      ),
    };
  }
);

export const preciosRelations = relations(precios, ({ one }) => ({
  dataset: one(datasets, {
    fields: [precios.id_dataset],
    references: [datasets.id],
  }),
}));

export const datasetsRelations = relations(datasets, ({ many }) => ({
  precios: many(precios),
  sucursales: many(sucursales),
}));

export const sucursalesRelations = relations(sucursales, ({ one }) => ({
  dataset: one(datasets, {
    fields: [sucursales.id_dataset],
    references: [datasets.id],
  }),
}));

// para actualizar la tabla:
//  insert into productos_descripcion_index
//  select distinct id_producto, productos_descripcion, productos_marca from precios
//  on conflict do nothing;
// probablemente se pueda poner un where en el select para solo seleccionar precios recientes (tipo id_dataset > X)
export const productos_descripcion_index = pgTable(
  "productos_descripcion_index",
  {
    id_producto: bigint("id_producto", { mode: "bigint" }),
    productos_descripcion: text("productos_descripcion").unique(),
    productos_marca: text("productos_marca"),
  },
  (table) => ({
    // https://orm.drizzle.team/learn/guides/postgresql-full-text-search
    tableSearchIndex: index(
      "productos_descripcion_index_search_descripcion"
    ).using("gin", sql`to_tsvector('spanish', ${table.productos_descripcion})`),
  })
);
