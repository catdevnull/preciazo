-- Custom SQL migration file, put you code below! --
CREATE VIRTUAL TABLE productos_fts USING fts5 (ean, name, content = precios, content_rowid = idd);