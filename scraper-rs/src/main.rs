use again::RetryPolicy;
use best_selling::BestSellingRecord;
use clap::{Parser, ValueEnum};
use cron::Schedule;
use deadpool_sqlite::Pool;
use futures::{future, stream, Future, StreamExt};
use nanoid::nanoid;
use reqwest::{header::HeaderMap, StatusCode, Url};
use simple_error::{bail, SimpleError};
use std::{
    env::{self},
    fs,
    path::PathBuf,
    str::FromStr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use thiserror::Error;

mod supermercado;
use supermercado::Supermercado;

#[derive(Parser)] // requires `derive` feature
enum Args {
    FetchList(FetchListArgs),
    ParseFile(ParseFileArgs),
    GetUrlList(GetUrlListArgs),
    ScrapUrl(ScrapUrlArgs),
    ScrapBestSelling,
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
struct ScrapUrlArgs {
    url: String,
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
        Args::ScrapUrl(a) => scrap_url_cli(a.url).await,
        Args::ScrapBestSelling => scrap_best_selling_cli().await,
        Args::Auto(_) => auto_cli().await,
        Args::Cron(_) => cron_cli().await,
    }
}

async fn scrap_url_cli(url: String) -> anyhow::Result<()> {
    let client = build_client();
    let res = fetch_and_parse(&client, url.clone()).await;

    println!("Result: {:#?}", res);
    res.map(|_| ())
}
mod best_selling;
async fn scrap_best_selling_cli() -> anyhow::Result<()> {
    let db = connect_db();
    let res = best_selling::get_all_best_selling(&db).await;

    println!("Result: {:#?}", res);
    res.map(|_| ())
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
    let db_path = env::var("DB_PATH").unwrap_or("../sqlite.db".to_string());
    let cfg = deadpool_sqlite::Config::new(db_path);
    cfg.create_pool(deadpool_sqlite::Runtime::Tokio1).unwrap()
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
            match err.downcast_ref::<reqwest::Error>() {
                Some(e) => match e.status() {
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
    #[error("parse error")]
    Parse(#[from] SimpleError),
    #[error("tl error")]
    Tl(#[from] tl::ParseError),
}

fn build_client() -> reqwest::Client {
    let mut headers = HeaderMap::new();
    headers.append("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36".parse().unwrap());
    reqwest::ClientBuilder::default()
        .timeout(Duration::from_secs(60 * 5))
        .connect_timeout(Duration::from_secs(60))
        .default_headers(headers)
        .build()
        .unwrap()
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
        .await?;

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
            sites::carrefour::parse(url, &tl::parse(body, tl::ParserOptions::default())?)
        }
        "diaonline.supermercadosdia.com.ar" => {
            sites::dia::parse(url, &tl::parse(body, tl::ParserOptions::default())?)
        }
        "www.cotodigital3.com.ar" => {
            sites::coto::parse(url, &tl::parse(body, tl::ParserOptions::default())?)
        }
        "www.jumbo.com.ar" => sites::jumbo::scrap(client, url, body).await,
        s => bail!("Unknown host {}", s),
    }
}

#[derive(Clone)]
struct AutoTelegram {
    token: String,
    chat_id: String,
}

#[derive(Clone)]
struct Auto {
    pool: Pool,
    telegram: Option<AutoTelegram>,
}
impl Auto {
    async fn download_supermercado(self, supermercado: Supermercado) -> anyhow::Result<()> {
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

    async fn inform_time<T: Future<Output = R>, R>(&self, msg: &str, action: T) -> R {
        let t0 = now_sec();
        let res = action.await;
        self.inform(&format!("{} (took {})", msg, now_sec() - t0))
            .await;
        res
    }

    async fn get_and_save_urls(&self, supermercado: &Supermercado) -> anyhow::Result<()> {
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

    async fn save_best_selling(&self, best_selling: Vec<BestSellingRecord>) -> anyhow::Result<()> {
        self.pool
            .get()
            .await?
            .interact(move |conn| -> Result<(), anyhow::Error> {
                let tx = conn.transaction()?;
                {
                    let mut stmt = tx.prepare(
                        r#"INSERT INTO db_best_selling(fetched_at, category, eans_json)
                            VALUES (?1, ?2, ?3);"#,
                    )?;
                    for record in best_selling {
                        let eans_json = serde_json::Value::from(record.eans).to_string();
                        let fetched_at = record.fetched_at.timestamp_millis();
                        stmt.execute(rusqlite::params![
                            fetched_at,
                            record.category.id(),
                            eans_json
                        ])?;
                    }
                }
                tx.commit()?;
                Ok(())
            })
            .await
            .unwrap()?;
        Ok(())
    }

    async fn inform(&self, msg: &str) {
        println!("{}", msg);
        if let Some(telegram) = &self.telegram {
            let u = Url::parse_with_params(
                &format!("https://api.telegram.org/bot{}/sendMessage", telegram.token),
                &[
                    ("chat_id", telegram.chat_id.clone()),
                    ("text", msg.to_string()),
                ],
            )
            .unwrap();
            reqwest::get(u).await.unwrap();
        }
    }
}

async fn auto_cli() -> anyhow::Result<()> {
    let db = connect_db();
    let telegram = {
        match (
            env::var("TELEGRAM_BOT_TOKEN"),
            env::var("TELEGRAM_BOT_CHAT_ID"),
        ) {
            (Ok(token), Ok(chat_id)) => Some(AutoTelegram { token, chat_id }),
            _ => {
                tracing::warn!("No token or chat_id for telegram");
                None
            }
        }
    };
    let auto = Auto { pool: db, telegram };
    auto.inform("[auto] Empezando scrap").await;
    let handles: Vec<_> = Supermercado::value_variants()
        .iter()
        .map(|s| tokio::spawn(auto.clone().download_supermercado(s.to_owned())))
        .collect();
    future::try_join_all(handles).await?;

    let best_selling = auto
        .inform_time(
            "Downloaded best selling",
            best_selling::get_all_best_selling(&auto.pool),
        )
        .await?;
    auto.save_best_selling(best_selling).await?;

    Ok(())
}
async fn cron_cli() -> anyhow::Result<()> {
    // https://crontab.guru
    let schedule = Schedule::from_str("0 0 2 * * * *").unwrap();
    // let schedule = Schedule::from_str("0 26 21 * * * *").unwrap();

    loop {
        let t = schedule
            .upcoming(chrono::Utc)
            .next()
            .unwrap()
            .signed_duration_since(chrono::Utc::now())
            .to_std()
            .unwrap();
        println!("Waiting for {:?}", t);
        tokio::time::sleep(t).await;
        auto_cli().await.unwrap();
    }
}

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
