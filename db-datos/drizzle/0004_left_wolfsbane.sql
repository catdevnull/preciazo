-- Custom SQL migration file, put you code below! --
create virtual table precios_fts using fts5(ean, url, name, content=precios, content_rowid=id);

insert into precios_fts(rowid,ean,url,name) select id,ean,url,name from precios;

-- https://sqlite.org/fts5.html#external_content_and_contentless_tables
-- Triggers to keep the FTS index up to date.
CREATE TRIGGER precios_fts_ai AFTER INSERT ON precios BEGIN
  INSERT INTO precios_fts(rowid, ean, url, name) VALUES (new.id, new.ean, new.url, new.name);
END;
CREATE TRIGGER precios_fts_ad AFTER DELETE ON precios BEGIN
  INSERT INTO precios_fts(precios_fts, rowid, ean, url, name) VALUES('delete', old.id, old.ean, old.url, old.name);
END;
CREATE TRIGGER precios_fts_au AFTER UPDATE ON precios BEGIN
  INSERT INTO precios_fts(precios_fts, rowid, ean, url, name) VALUES('delete', old.id, old.ean, old.url, old.name);
  INSERT INTO precios_fts(rowid, ean, url, name) VALUES (new.id, new.ean, new.url, new.name);
END;
