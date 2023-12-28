-- Custom SQL migration file, put you code below! --
insert into precios_fts(rowid,ean,url,name) select id,ean,url,name from precios;
