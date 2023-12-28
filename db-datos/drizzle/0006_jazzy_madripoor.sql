-- Custom SQL migration file, put you code below! --

-- https://sqlite.org/fts5.html#external_content_and_contentless_tables
-- Triggers to keep the FTS index up to date.
CREATE TRIGGER precios_fts_ai AFTER INSERT ON precios BEGIN
  INSERT INTO precios_fts(rowid, ean, url, name) VALUES (new.id, new.ean, new.url, new.name);
END;
