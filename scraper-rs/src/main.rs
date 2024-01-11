use again::RetryPolicy;
use async_channel::{Receiver, Sender};
use nanoid::nanoid;
use reqwest::Url;
use rusqlite::Connection;
use simple_error::{bail, SimpleError};
use std::{
    env::{self, args},
    fs,
    path::PathBuf,
    time::Duration,
};
use thiserror::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let mut args = args().skip(1);
    let links_list_path = args.next().expect("Falta arg para path de lista de urls");
    let links_str = fs::read_to_string(links_list_path).unwrap();
    let links = links_str
        .split('\n')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_owned())
        .collect::<Vec<_>>();

    let handle = {
        let (sender, receiver) = async_channel::bounded::<String>(1);
        let (res_sender, res_receiver) = async_channel::unbounded::<PrecioPoint>();

        let mut handles = Vec::new();
        for _ in 1..env::var("N_COROUTINES")
            .map_or(Ok(128), |s| s.parse::<usize>())
            .expect("N_COROUTINES no es un número")
        {
            let rx = receiver.clone();
            let tx = res_sender.clone();
            handles.push(tokio::spawn(worker(rx, tx)));
        }

        let db_writer_handle = tokio::spawn(db_writer(res_receiver));

        for link in links {
            sender.send_blocking(link).unwrap();
        }
        sender.close();

        for handle in handles {
            handle.await.unwrap();
        }

        db_writer_handle
    };
    handle.await.unwrap();
    Ok(())
}

async fn worker(rx: Receiver<String>, tx: Sender<PrecioPoint>) {
    let client = reqwest::ClientBuilder::default().build().unwrap();
    while let Ok(url) = rx.recv().await {
        let res = fetch_and_parse(&client, url.clone()).await;
        match res {
            Ok(ex) => {
                tx.send(ex).await.unwrap();
            }
            Err(err) => {
                tracing::error!(error=%err, url=url);
            }
        }
    }
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
    let url_p = Url::parse(&url).unwrap();
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

    let maybe_point = {
        let dom = tl::parse(&body, tl::ParserOptions::default()).map_err(FetchError::Tl)?;
        match url_p.host_str().unwrap() {
            "www.carrefour.com.ar" => sites::carrefour::parse(url, &dom),
            "diaonline.supermercadosdia.com.ar" => sites::dia::parse(url, &dom),
            s => bail!("Unknown host {}", s),
        }
    };

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

async fn db_writer(rx: Receiver<PrecioPoint>) {
    // let conn = Connection::open("../scraper/sqlite.db").unwrap();
    // let mut stmt = conn.prepare("SELECT id, name, data FROM person")?;
    let mut n = 0;
    while let Ok(res) = rx.recv().await {
        n += 1;
        println!("{}", n);
        println!("{:?}", res)
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
