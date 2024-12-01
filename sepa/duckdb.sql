CREATE TABLE datasets (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    date DATE,
    id_comercio INTEGER
);
CREATE SEQUENCE seq_datasets START 1;


CREATE TABLE precios (
    id_dataset INTEGER not null,
    id_comercio INTEGER not null,
    id_bandera INTEGER not null,
    id_sucursal INTEGER not null,
    id_producto BIGINT not null,
    productos_ean INTEGER,
    productos_descripcion TEXT,
    productos_cantidad_presentacion DECIMAL(10,2),
    productos_unidad_medida_presentacion TEXT,
    productos_marca TEXT,
    productos_precio_lista DECIMAL(10,2),
    productos_precio_referencia DECIMAL(10,2),
    productos_cantidad_referencia DECIMAL(10,2),
    productos_unidad_medida_referencia TEXT,
    productos_precio_unitario_promo1 DECIMAL(10,2),
    productos_leyenda_promo1 TEXT,
    productos_precio_unitario_promo2 DECIMAL(10,2),
    productos_leyenda_promo2 TEXT,
    FOREIGN KEY (id_dataset) REFERENCES datasets(id)
);

CREATE TABLE productos_descripcion_index (
    id_producto BIGINT,
    productos_descripcion TEXT UNIQUE,
    productos_marca TEXT
);

CREATE TABLE sucursales (
    id_dataset INTEGER not null,
    id_comercio INTEGER not null,
    id_bandera INTEGER not null, 
    id_sucursal INTEGER not null,
    sucursales_nombre TEXT,
    sucursales_tipo TEXT,
    sucursales_calle TEXT,
    sucursales_numero TEXT,
    sucursales_latitud DECIMAL(18, 15),
    sucursales_longitud DECIMAL(18, 15),
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
    FOREIGN KEY (id_dataset) REFERENCES datasets(id),
    UNIQUE (id_dataset, id_comercio, id_bandera, id_sucursal)
);

CREATE TABLE banderas (
    id_dataset INTEGER not null,
    id_comercio INTEGER NOT NULL,
    id_bandera INTEGER NOT NULL,
    comercio_cuit TEXT NOT NULL,
    comercio_razon_social TEXT,
    comercio_bandera_nombre TEXT,
    comercio_bandera_url TEXT,
    comercio_ultima_actualizacion DATE,
    comercio_version_sepa TEXT,
    FOREIGN KEY (id_dataset) REFERENCES datasets(id)
);

-- Create indexes
CREATE INDEX idx_precios_id_producto ON precios(id_producto);
CREATE INDEX idx_precios_id_producto_id_dataset ON precios(id_producto, id_dataset);
CREATE INDEX idx_precios_id_dataset_id_comercio_id_sucursal ON precios(id_dataset, id_comercio, id_sucursal);