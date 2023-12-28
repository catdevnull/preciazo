-- Custom SQL migration file, put you code below! --
create virtual table precios_fts using fts5(ean, url, name, content=precios, content_rowid=id);

