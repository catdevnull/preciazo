CREATE TABLE
    precios (
        id serial PRIMARY KEY NOT NULL,
        ean text NOT NULL,
        fetched_at integer NOT NULL,
        precio_centavos integer,
        in_stock integer,
        url text NOT NULL,
        warc_record_id text,
        parser_version integer,
        name text,
        image_url text
    );

CREATE TABLE
    producto_urls (
        id serial PRIMARY KEY NOT NULL,
        url text NOT NULL,
        first_seen integer NOT NULL,
        last_seen integer NOT NULL
    );