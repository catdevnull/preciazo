use again::RetryPolicy;
use async_channel::Receiver;
use clap::Parser;
use nanoid::nanoid;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use reqwest::{StatusCode, Url};
use simple_error::{bail, SimpleError};
use std::{
    env::{self},
    fs,
    path::PathBuf,
    time::Duration,
};
use thiserror::Error;

#[derive(Parser)] // requires `derive` feature
enum Args {
    FetchList(FetchListArgs),
    ParseFile(ParseFileArgs),
}
#[derive(clap::Args)]
struct FetchListArgs {
    list_path: String,
}
#[derive(clap::Args)]
struct ParseFileArgs {
    file_path: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    match Args::parse() {
        Args::FetchList(a) => fetch_list_cli(a.list_path).await,
        Args::ParseFile(a) => parse_file_cli(a.file_path).await,
    }
}

async fn fetch_list_cli(links_list_path: String) -> anyhow::Result<()> {
    let links_str = fs::read_to_string(links_list_path).unwrap();
    let links = links_str
        .split('\n')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_owned())
        .collect::<Vec<_>>();

    let (sender, receiver) = async_channel::bounded::<String>(1);

    let db_path = env::var("DB_PATH").unwrap_or("../scraper/sqlite.db".to_string());
    let manager = SqliteConnectionManager::file(db_path);
    let pool = Pool::new(manager).unwrap();

    let n_coroutines = env::var("N_COROUTINES")
        .map_or(Ok(128), |s| s.parse::<usize>())
        .expect("N_COROUTINES no es un número");
    let handles = (1..n_coroutines)
        .map(|_| {
            let rx = receiver.clone();
            let pool = pool.clone();
            tokio::spawn(worker(rx, pool))
        })
        .collect::<Vec<_>>();

    for link in links {
        sender.send_blocking(link).unwrap();
    }
    sender.close();

    let mut counters = Counters::default();
    for handle in handles {
        let c = handle.await.unwrap();
        counters.success += c.success;
        counters.errored += c.errored;
        counters.skipped += c.skipped;
    }

    println!("Finished: {:?}", counters);
    Ok(())
}

fn build_client() -> reqwest::Client {
    reqwest::ClientBuilder::default().build().unwrap()
}

#[derive(Default, Debug)]
struct Counters {
    success: u64,
    errored: u64,
    skipped: u64,
}

async fn worker(rx: Receiver<String>, pool: Pool<SqliteConnectionManager>) -> Counters {
    let client = build_client();

    let mut counters = Counters::default();
    while let Ok(url) = rx.recv().await {
        let res = fetch_and_parse(&client, url.clone()).await;
        match res {
            Ok(res) => {
                counters.success += 1;
                pool.get().unwrap().execute("INSERT INTO precios(ean, fetched_at, precio_centavos, in_stock, url, warc_record_id, parser_version, name, image_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);",rusqlite::params![
                    res.ean,
                    res.fetched_at,
                    res.precio_centavos,
                    res.in_stock,
                    res.url,
                    None::<String>,
                    res.parser_version,
                    res.name,
                    res.image_url,
                ]).unwrap();
            }
            Err(err) => {
                match err.downcast_ref::<FetchError>() {
                    Some(FetchError::HttpStatus(StatusCode::NOT_FOUND)) => counters.skipped += 1,
                    _ => counters.errored += 1,
                }

                tracing::error!(error=%err, url=url);
            }
        }
    }

    counters
}

#[derive(Debug, Error)]
enum FetchError {
    #[error("reqwest error")]
    Http(#[from] reqwest::Error),
    #[error("http status: {0}")]
    HttpStatus(reqwest::StatusCode),
    #[error("parse error")]
    Parse(#[from] SimpleError),
    #[error("tl error")]
    Tl(#[from] tl::ParseError),
}

#[tracing::instrument(skip(client))]
async fn fetch_and_parse(
    client: &reqwest::Client,
    url: String,
) -> Result<PrecioPoint, anyhow::Error> {
    let policy = RetryPolicy::exponential(Duration::from_millis(300))
        .with_max_retries(10)
        .with_jitter(true);

    let response = policy
        .retry(|| {
            let request = client.get(url.as_str()).build().unwrap();
            client.execute(request)
        })
        .await
        .map_err(FetchError::Http)?;
    if !response.status().is_success() {
        bail!(FetchError::HttpStatus(response.status()));
    }
    let body = response.text().await.map_err(FetchError::Http)?;

    let maybe_point = { scrap_url(client, url, &body).await };

    let point = match maybe_point {
        Ok(p) => Ok(p),
        Err(err) => {
            let debug_path = PathBuf::from("debug/");
            tokio::fs::create_dir_all(&debug_path).await.unwrap();
            let file_path = debug_path.join(format!("{}.html", nanoid!()));
            tokio::fs::write(&file_path, &body).await.unwrap();
            tracing::debug!(error=%err, "Failed to parse, saved body at {}",file_path.display());
            Err(err)
        }
    }?;

    Ok(point)
}

async fn parse_file_cli(file_path: String) -> anyhow::Result<()> {
    let file = tokio::fs::read_to_string(file_path).await?;

    let client = build_client();

    let url = {
        let dom = tl::parse(&file, tl::ParserOptions::default())?;
        dom.query_selector("link[rel=\"canonical\"]")
            .unwrap()
            .filter_map(|h| h.get(dom.parser()))
            .filter_map(|n| n.as_tag())
            .next()
            .and_then(|t| t.attributes().get("href").flatten())
            .expect("No meta canonical")
            .as_utf8_str()
            .to_string()
    };

    println!("URL: {}", &url);
    println!("{:?}", scrap_url(&client, url, &file).await);
    Ok(())
}

async fn scrap_url(
    client: &reqwest::Client,
    url: String,
    body: &str,
) -> anyhow::Result<PrecioPoint> {
    let url_p = Url::parse(&url).unwrap();
    match url_p.host_str().unwrap() {
        "www.carrefour.com.ar" => {
            sites::carrefour::parse(url, &tl::parse(&body, tl::ParserOptions::default())?)
        }
        "diaonline.supermercadosdia.com.ar" => {
            sites::dia::parse(url, &tl::parse(&body, tl::ParserOptions::default())?)
        }
        "www.cotodigital3.com.ar" => {
            sites::coto::parse(url, &tl::parse(&body, tl::ParserOptions::default())?)
        }
        "www.jumbo.com.ar" => sites::jumbo::scrap(client, url, body).await,
        s => bail!("Unknown host {}", s),
    }
}

use std::time::{SystemTime, UNIX_EPOCH};

mod sites;

#[derive(Debug)]
struct PrecioPoint {
    ean: String,
    // unix
    fetched_at: u64,
    precio_centavos: Option<u64>,
    in_stock: Option<bool>,
    url: String,
    parser_version: u16,
    name: Option<String>,
    image_url: Option<String>,
}

fn now_sec() -> u64 {
    let start = SystemTime::now();
    let since_the_epoch = start
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards");
    since_the_epoch.as_secs()
}
