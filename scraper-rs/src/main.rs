use again::RetryPolicy;
use clap::{Parser, ValueEnum};
use deadpool_sqlite::Pool;
use futures::{future, stream, StreamExt};
use nanoid::nanoid;
use reqwest::{StatusCode, Url};
use simple_error::{bail, SimpleError};
use std::{
    env::{self},
    fs,
    path::PathBuf,
    time::Duration,
};
use thiserror::Error;
use tokio::time;

#[derive(ValueEnum, Clone, Debug)]
enum Supermercado {
    Dia,
    Jumbo,
    Carrefour,
    Coto,
}
impl Supermercado {
    fn host(self: &Self) -> &'static str {
        match self {
            Self::Dia => "diaonline.supermercadosdia.com.ar",
            Self::Carrefour => "www.carrefour.com.ar",
            Self::Coto => "www.cotodigital3.com.ar",
            Self::Jumbo => "www.jumbo.com.ar",
        }
    }
}

#[derive(Parser)] // requires `derive` feature
enum Args {
    FetchList(FetchListArgs),
    ParseFile(ParseFileArgs),
    GetUrlList(GetUrlListArgs),
    Auto(AutoArgs),
    Cron(AutoArgs),
}
#[derive(clap::Args)]
struct FetchListArgs {
    list_path: String,
}
#[derive(clap::Args)]
struct ParseFileArgs {
    file_path: String,
}
#[derive(clap::Args)]
struct GetUrlListArgs {
    #[arg(value_enum)]
    supermercado: Supermercado,
}
#[derive(clap::Args)]
struct AutoArgs {}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    match Args::parse() {
        Args::FetchList(a) => fetch_list_cli(a.list_path).await,
        Args::ParseFile(a) => parse_file_cli(a.file_path).await,
        Args::GetUrlList(a) => get_url_list_cli(a.supermercado).await,
        Args::Auto(_) => auto_cli().await,
        Args::Cron(_) => cron_cli().await,
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

    let pool = connect_db();
    let counters = fetch_list(&pool, links).await;

    println!("Finished: {:?}", counters);
    Ok(())
}

async fn fetch_list(pool: &Pool, links: Vec<String>) -> Counters {
    let n_coroutines = env::var("N_COROUTINES")
        .map_or(Ok(24), |s| s.parse::<usize>())
        .expect("N_COROUTINES no es un número");

    let client = build_client();

    stream::iter(links)
        .map(|url| {
            let pool = pool.clone();
            let client = client.clone();
            tokio::spawn(fetch_and_save(client, url, pool))
        })
        .buffer_unordered(n_coroutines)
        .fold(Counters::default(), move |x, y| {
            let ret = y.unwrap();
            future::ready(Counters {
                success: x.success + ret.success,
                errored: x.errored + ret.errored,
                skipped: x.skipped + ret.skipped,
            })
        })
        .await
}

fn connect_db() -> Pool {
    let db_path = env::var("DB_PATH").unwrap_or("../scraper/sqlite.db".to_string());
    let cfg = deadpool_sqlite::Config::new(db_path);
    let pool = cfg.create_pool(deadpool_sqlite::Runtime::Tokio1).unwrap();
    pool
}

fn build_client() -> reqwest::Client {
    reqwest::ClientBuilder::default()
        .timeout(Duration::from_secs(60 * 5))
        .connect_timeout(Duration::from_secs(60))
        .build()
        .unwrap()
}

#[derive(Default, Debug)]
struct Counters {
    success: u64,
    errored: u64,
    skipped: u64,
}

async fn fetch_and_save(client: reqwest::Client, url: String, pool: Pool) -> Counters {
    let res = fetch_and_parse(&client, url.clone()).await;
    let mut counters = Counters::default();
    match res {
        Ok(res) => {
            counters.success += 1;
            pool.get().await.unwrap().interact(move |conn| conn.execute(
                "INSERT INTO precios(ean, fetched_at, precio_centavos, in_stock, url, warc_record_id, parser_version, name, image_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);",
                rusqlite::params![
                    res.ean,
                    res.fetched_at,
                    res.precio_centavos,
                    res.in_stock,
                    res.url,
                    None::<String>,
                    res.parser_version,
                    res.name,
                    res.image_url,
                ]
            )).await.unwrap().unwrap();
        }
        Err(err) => {
            match err.downcast_ref::<FetchError>() {
                Some(FetchError::Http(e)) => match e.status() {
                    Some(StatusCode::NOT_FOUND) => counters.skipped += 1,
                    _ => counters.errored += 1,
                },
                _ => counters.errored += 1,
            }

            tracing::error!(error=%err, url=url);
        }
    }
    counters
}

#[derive(Debug, Error)]
enum FetchError {
    #[error("reqwest error")]
    Http(#[from] reqwest::Error),
    #[error("parse error")]
    Parse(#[from] SimpleError),
    #[error("tl error")]
    Tl(#[from] tl::ParseError),
}

pub async fn do_request(client: &reqwest::Client, url: &str) -> reqwest::Result<reqwest::Response> {
    let request = client.get(url).build()?;
    let response = client.execute(request).await?.error_for_status()?;
    Ok(response)
}

pub fn get_retry_policy() -> again::RetryPolicy {
    RetryPolicy::exponential(Duration::from_millis(300))
        .with_max_retries(10)
        .with_jitter(true)
}

pub fn retry_if_wasnt_not_found(err: &reqwest::Error) -> bool {
    !err.status().is_some_and(|s| s == StatusCode::NOT_FOUND)
}

#[tracing::instrument(skip(client))]
async fn fetch_and_parse(
    client: &reqwest::Client,
    url: String,
) -> Result<PrecioPoint, anyhow::Error> {
    let body = get_retry_policy()
        .retry_if(|| do_request(client, &url), retry_if_wasnt_not_found)
        .await?
        .text()
        .await
        .map_err(FetchError::Http)?;

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
            .find_map(|n| n.as_tag())
            .and_then(|t| t.attributes().get("href").flatten())
            .expect("No meta canonical")
            .as_utf8_str()
            .to_string()
    };

    println!("URL: {}", &url);
    println!("{:?}", scrap_url(&client, url, &file).await);
    Ok(())
}

async fn get_url_list_cli(supermercado: Supermercado) -> anyhow::Result<()> {
    let urls = get_urls(&supermercado).await?;
    urls.iter().for_each(|s| {
        println!("{}", s);
    });

    Ok(())
}

async fn get_urls(supermercado: &Supermercado) -> Result<Vec<String>, anyhow::Error> {
    Ok(match supermercado {
        Supermercado::Dia => sites::dia::get_urls().await?,
        Supermercado::Jumbo => sites::jumbo::get_urls().await?,
        Supermercado::Carrefour => sites::carrefour::get_urls().await?,
        Supermercado::Coto => sites::coto::get_urls().await?,
    })
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

#[derive(Clone)]
struct Auto {
    pool: Pool,
    telegram_token: String,
    telegram_chat_id: String,
}
impl Auto {
    async fn download_supermercado(self: Self, supermercado: Supermercado) -> anyhow::Result<()> {
        {
            let t0 = now_sec();
            self.get_and_save_urls(&supermercado).await?;
            self.inform(&format!(
                "Downloaded url list {:?} (took {})",
                &supermercado,
                now_sec() - t0
            ))
            .await;
        }
        let links: Vec<String> = {
            let search = format!("%{}%", supermercado.host());
            self.pool
                .get()
                .await?
                .interact(move |conn| -> anyhow::Result<Vec<String>> {
                    Ok(conn
                        .prepare(
                            r#"SELECT url FROM producto_urls
                                    WHERE url LIKE ?1;"#,
                        )?
                        .query_map(rusqlite::params![search], |r| r.get::<_, String>(0))?
                        .map(|r| r.unwrap())
                        .collect())
                })
                .await
                .unwrap()?
        };
        // {
        //     let debug_path = PathBuf::from("debug/");
        //     tokio::fs::create_dir_all(&debug_path).await.unwrap();
        //     let file_path = debug_path.join(format!("{}.txt", nanoid!()));
        //     tokio::fs::write(&file_path, &links.join("\n"))
        //         .await
        //         .unwrap();
        //     tracing::info!("Lista de {:?}: {:?}", &supermercado, file_path.display());
        // }
        {
            let t0 = now_sec();
            let counters = fetch_list(&self.pool, links).await;
            self.inform(&format!(
                "Downloaded {:?}: {:?} (took {})",
                &supermercado,
                counters,
                now_sec() - t0
            ))
            .await;
        }
        Ok(())
    }

    async fn get_and_save_urls(self: &Self, supermercado: &Supermercado) -> anyhow::Result<()> {
        let urls = get_urls(supermercado).await?;
        self.pool
            .get()
            .await?
            .interact(|conn| -> Result<(), anyhow::Error> {
                let tx = conn.transaction()?;
                {
                    let mut stmt = tx.prepare(
                        r#"INSERT INTO producto_urls(url, first_seen, last_seen)
                            VALUES (?1, ?2, ?2)
                            ON CONFLICT(url) DO UPDATE SET last_seen=?2;"#,
                    )?;
                    let now: u64 = now_ms().try_into()?;
                    for url in urls {
                        stmt.execute(rusqlite::params![url, now])?;
                    }
                }
                tx.commit()?;
                Ok(())
            })
            .await
            .unwrap()?;
        Ok(())
    }

    async fn inform(self: &Self, msg: &str) {
        println!("{}", msg);
        let u = Url::parse_with_params(
            &format!(
                "https://api.telegram.org/bot{}/sendMessage",
                self.telegram_token
            ),
            &[
                ("chat_id", self.telegram_chat_id.clone()),
                ("text", msg.to_string()),
            ],
        )
        .unwrap();
        reqwest::get(u).await.unwrap();
    }
}

async fn auto_cli() -> anyhow::Result<()> {
    let db = connect_db();
    let auto = Auto {
        pool: db,
        telegram_token: env::var("TELEGRAM_BOT_TOKEN")?,
        telegram_chat_id: env::var("TELEGRAM_BOT_CHAT_ID")?,
    };
    auto.inform("[auto] Empezando scrap").await;
    let handles: Vec<_> = Supermercado::value_variants()
        .iter()
        .map(|s| tokio::spawn(auto.clone().download_supermercado(s.to_owned())))
        .collect();
    future::try_join_all(handles).await?;
    Ok(())
}
async fn cron_cli() -> anyhow::Result<()> {
    let mut interval = time::interval(std::time::Duration::from_secs(60 * 60 * 24));

    loop {
        interval.tick().await;
        tokio::spawn(auto_cli());
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
    since_the_epoch().as_secs()
}
fn now_ms() -> u128 {
    since_the_epoch().as_millis()
}

fn since_the_epoch() -> Duration {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
}
