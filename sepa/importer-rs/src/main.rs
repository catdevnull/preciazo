use anyhow::anyhow;
use rayon::prelude::*;
use std::{
    env::args,
    fs,
    io::{self, BufRead, Write},
    path::{Path, PathBuf},
};
use tar::Archive;
use zstd::Decoder;

use duckdb::Connection;

#[derive(Debug, serde::Deserialize)]
struct Producto {
    id_comercio: u32,
    id_bandera: u32,
    id_sucursal: u32,
    id_producto: u64,
    productos_ean: u64,
    productos_descripcion: String,
    productos_cantidad_presentacion: i32,
    productos_unidad_medida_presentacion: String,
    productos_marca: String,
    productos_precio_lista: f64,
    productos_precio_referencia: f64,
    productos_cantidad_referencia: i32,
    productos_unidad_medida_referencia: String,
    productos_precio_unitario_promo1: Option<f64>,
    productos_leyenda_promo1: Option<String>,
    productos_precio_unitario_promo2: Option<f64>,
    productos_leyenda_promo2: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct Bandera {
    id_comercio: u32,
    id_bandera: u32,
    comercio_cuit: String,
    comercio_razon_social: String,
    comercio_bandera_nombre: String,
    comercio_bandera_url: String,
    comercio_ultima_actualizacion: String,
    comercio_version_sepa: String,
}
fn read_csv_trimmed(path: PathBuf) -> anyhow::Result<String> {
    Ok(io::BufReader::new(std::fs::File::open(path)?)
        .lines()
        .map(|line| {
            line.map(|l| l.trim().to_string())
                .map_err(anyhow::Error::from)
        })
        .take_while(|line| {
            if let Ok(l) = line {
                if l.starts_with('&') || l.starts_with(' ') || l.starts_with('\0') || l.is_empty() {
                    !l.replace("&#032;", "")
                        .replace('\0', "")
                        .replace(" ", "")
                        .is_empty()
                } else if l.starts_with("Última") {
                    // algunos datasets erroneamente les falta el newline
                    false
                } else {
                    true
                }
            } else {
                true
            }
        })
        .map(|line| {
            line.and_then(|l| {
                if l.starts_with("|") {
                    Err(anyhow!("Alberdi S.A.: newlines incorrectos"))
                } else {
                    Ok(l)
                }
            })
        })
        .collect::<Result<Vec<String>, _>>()?
        .join("\n"))
}

#[derive(Debug, serde::Deserialize)]
struct Sucursal {
    id_comercio: u32,
    id_bandera: u32,
    id_sucursal: u32,
    sucursales_nombre: String,
    sucursales_tipo: String,
    sucursales_calle: String,
    sucursales_numero: String,
    sucursales_latitud: Option<f64>,
    sucursales_longitud: Option<f64>,
    sucursales_observaciones: Option<String>,
    sucursales_barrio: Option<String>,
    sucursales_codigo_postal: String,
    sucursales_localidad: String,
    sucursales_provincia: String,
    sucursales_lunes_horario_atencion: String,
    sucursales_martes_horario_atencion: String,
    sucursales_miercoles_horario_atencion: String,
    sucursales_jueves_horario_atencion: String,
    sucursales_viernes_horario_atencion: String,
    sucursales_sabado_horario_atencion: String,
    /// bruh. a veces lo escriben asi
    #[serde(alias = "sucursales_domingohorario_atencion")]
    sucursales_domingo_horario_atencion: String,
}

fn import_dataset(conn: &Connection, dir_path: &Path) -> anyhow::Result<()> {
    conn.execute("BEGIN", duckdb::params![])?;

    let dataset_id = {
        let re_date = regex::Regex::new(r"(\d{4}-\d{2}-\d{2})")?;
        let re_comercio = regex::Regex::new(r"comercio-sepa-(\d+)")?;

        let path_str = dir_path.to_string_lossy();
        let date = re_date
            .captures(&path_str)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str())
            .ok_or(anyhow::anyhow!("No se pudo obtener la fecha"))?;
        let id_comercio = re_comercio
            .captures(&path_str)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str())
            .ok_or(anyhow::anyhow!("No se pudo obtener el id del comercio"))?;

        conn.query_row(
        "insert into datasets (id, name, date, id_comercio) values (nextval('seq_datasets'), ?, ?, ?) returning id",
        duckdb::params![dir_path.file_name().unwrap().to_str().unwrap(), date, id_comercio],
        |row| row.get::<_, i64>(0)
    )?
    };

    let banderas = {
        let file = read_csv_trimmed(dir_path.join("comercio.csv"))?;
        csv::ReaderBuilder::new()
            .delimiter(b'|')
            .from_reader(file.as_bytes())
            .records()
            .map(|r| r.unwrap().deserialize::<Bandera>(None).unwrap())
            .collect::<Vec<_>>()
    };
    let comercio_cuit = banderas[0].comercio_cuit.clone();
    println!("comercio_cuit: {}", comercio_cuit);

    {
        let mut app = conn.appender("banderas")?;
        for bandera in banderas {
            app.append_row(duckdb::params![
                dataset_id,
                bandera.id_comercio,
                bandera.id_bandera,
                bandera.comercio_cuit,
                bandera.comercio_razon_social,
                bandera.comercio_bandera_nombre,
                bandera.comercio_bandera_url,
                bandera.comercio_ultima_actualizacion,
                bandera.comercio_version_sepa,
            ])?;
        }
        app.flush()?;
    }

    {
        let mut app = conn.appender("sucursales")?;
        let csv = read_csv_trimmed(dir_path.join("sucursales.csv"))?;
        let mut file = csv::ReaderBuilder::new()
            .delimiter(b'|')
            .from_reader(csv.as_bytes());
        let sucursales: Vec<Sucursal> = file
            .deserialize()
            .map(|result: csv::Result<Sucursal>| {
                result.map_err(|e| {
                    println!("Error: {:?}", e);
                    println!("CSV content: {}", csv);
                    e
                })
            })
            .collect::<Result<_, _>>()?;

        for sucursal in sucursales {
            app.append_row(duckdb::params![
                dataset_id,
                sucursal.id_comercio,
                sucursal.id_bandera,
                sucursal.id_sucursal,
                sucursal.sucursales_nombre,
                sucursal.sucursales_tipo,
                sucursal.sucursales_calle,
                sucursal.sucursales_numero,
                sucursal.sucursales_latitud,
                sucursal.sucursales_longitud,
                sucursal.sucursales_observaciones,
                sucursal.sucursales_barrio,
                sucursal.sucursales_codigo_postal,
                sucursal.sucursales_localidad,
                sucursal.sucursales_provincia,
                sucursal.sucursales_lunes_horario_atencion,
                sucursal.sucursales_martes_horario_atencion,
                sucursal.sucursales_miercoles_horario_atencion,
                sucursal.sucursales_jueves_horario_atencion,
                sucursal.sucursales_viernes_horario_atencion,
                sucursal.sucursales_sabado_horario_atencion,
                sucursal.sucursales_domingo_horario_atencion,
            ])?;
        }
    }

    {
        let file = read_csv_trimmed(dir_path.join("productos.csv"))?;
        let mut temp = tempfile::NamedTempFile::new()?;
        // get path to file

        temp.write_all(file.as_bytes())?;
        // let mut app = conn.appender("precios")?;
        let start = std::time::Instant::now();
        conn.execute(
            "
insert into precios select ? as id_dataset, * from read_csv(?, delim='|', header=true, nullstr='')",
            duckdb::params![dataset_id, &temp.path().to_string_lossy()],
        )?;
        // let mut rdr = csv::ReaderBuilder::new()
        //     .delimiter(b'|')
        //     .from_reader(file.as_bytes());
        // for result in rdr.records() {
        //     match result {
        //         Ok(record) => {
        //             // println!("{:?}", record);
        //             let producto: Producto = record.deserialize(None).unwrap();
        //             // println!("{:?}", producto);
        //             // app.append_row(duckdb::params![
        //             //     dataset_id,
        //             //     producto.id_comercio,
        //             //     producto.id_bandera,
        //             //     producto.id_sucursal,
        //             //     producto.id_producto,
        //             //     producto.productos_ean,
        //             //     producto.productos_descripcion,
        //             //     producto.productos_cantidad_presentacion,
        //             //     producto.productos_unidad_medida_presentacion,
        //             //     producto.productos_marca,
        //             //     producto.productos_precio_lista,
        //             //     producto.productos_precio_referencia,
        //             //     producto.productos_cantidad_referencia,
        //             //     producto.productos_unidad_medida_referencia,
        //             //     producto.productos_precio_unitario_promo1,
        //             //     producto.productos_leyenda_promo1,
        //             //     producto.productos_precio_unitario_promo2,
        //             //     producto.productos_leyenda_promo2,
        //             // ])?;
        //         }
        //         Err(e) => {
        //             println!("Error: {:?}", e);
        //             println!(
        //                 "lines: {:?}",
        //                 &file[e.position().unwrap().byte() as usize..]
        //             );
        //             panic!("Error parsing csv: {:#?}", e);
        //         }
        //     }
        // }
        // app.flush()?;
        println!("Time taken flushed: {:?}", start.elapsed());
    }
    conn.execute("COMMIT", duckdb::params![])?;

    Ok(())
}

/// a dataset dump is a dump of a single day with multiple datasets (one per comercio)
fn import_dataset_dump(conn: &Connection, dir_path: &Path) -> anyhow::Result<()> {
    for entry in fs::read_dir(dir_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let res = import_dataset(conn, &path);
            match res {
                Ok(_) => {}
                Err(e) => {
                    println!("Error importing dataset: {:?}", e);
                    conn.execute("ROLLBACK", duckdb::params![])?;
                }
            }
        }
    }
    Ok(())
}

fn is_dataset_dump(dir_path: &Path) -> anyhow::Result<bool> {
    Ok(fs::read_dir(dir_path)?.any(|entry| {
        entry
            .as_ref()
            .map(|e| e.file_name() == "dataset-info.json")
            .unwrap_or(false)
    }))
}

fn main() {
    let conn = Connection::open("importer-rs.db").unwrap();

    // let decoded = Decoder::new(
    //     std::fs::File::open("/d076720f-a7f0-4af8-b1d6-1b99d5a90c14-revID-a3de6c6a-8795-4348-a16d-bc626e9f1b2e-sepa_jueves.zip-repackaged.tar.zst").unwrap(),
    // )
    // .unwrap();
    // let mut archive = Archive::new(decoded);
    // archive
    //     .entries()
    //     .unwrap()
    //     .filter_map(|e| e.ok())
    //     .filter(|e| e.path().unwrap().ends_with("comercio.csv"))
    //     .collect::<Vec<_>>()
    //     .par_iter()
    //     .for_each(|entry| {
    //         let path = entry.path().unwrap();
    //         let parent = path.parent().unwrap();
    //         import_dataset(&conn.try_clone().unwrap(), parent.to_path_buf()).unwrap();
    //     });

    let path: PathBuf = args()
        .nth(1)
        .unwrap_or("/sepa_1_comercio-sepa-10_2024-11-23_09-05-11/".to_owned())
        .into();

    if is_dataset_dump(&path).unwrap() {
        import_dataset_dump(&conn, &path).unwrap();
    } else {
        import_dataset(&conn.try_clone().unwrap(), &path).unwrap();
    }
    println!("Hello, world!");
}
