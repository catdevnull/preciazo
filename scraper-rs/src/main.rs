use again::RetryPolicy;
use chrono::{DateTime, Utc};
use clap::{Parser, ValueEnum};
use cron::Schedule;
use db::Db;
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
#[derive(clap::Args, Clone, Copy)]
struct AutoArgs {
    #[arg(long)]
    n_products: Option<usize>,
    #[arg(long)]
    only_supermercado: Option<Supermercado>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    match Args::parse() {
        Args::FetchList(a) => fetch_list_cli(a.list_path).await,
        Args::ParseFile(a) => parse_file_cli(a.file_path).await,
        Args::GetUrlList(a) => get_url_list_cli(a.supermercado).await,
        Args::ScrapUrl(a) => scrap_url_cli(a.url).await,
        Args::ScrapBestSelling => scrap_best_selling_cli().await,
        Args::Auto(a) => auto_cli(a).await,
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
    let db = Db::connect().await?;
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

    let db = Db::connect().await?;
    let counters = fetch_list(&db, links).await;

    println!("Finished: {:?}", counters);
    Ok(())
}

async fn fetch_list(db: &Db, links: Vec<String>) -> Counters {
    let n_coroutines = env::var("N_COROUTINES")
        .map_or(Ok(24), |s| s.parse::<usize>())
        .expect("N_COROUTINES no es un número");

    let client = build_client();

    stream::iter(links)
        .map(|url| {
            let db = db.clone();
            let client = client.clone();
            tokio::spawn(fetch_and_save(client, url, db))
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

mod db;

#[derive(Default, Debug)]
struct Counters {
    success: u64,
    errored: u64,
    skipped: u64,
}

async fn fetch_and_save(client: reqwest::Client, url: String, db: Db) -> Counters {
    let res = fetch_and_parse(&client, url.clone()).await;
    let mut counters = Counters::default();
    match res {
        Ok(res) => {
            counters.success += 1;
            db.insert_precio(res).await.unwrap();
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
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .unwrap()
}
pub async fn do_request(client: &reqwest::Client, url: &str) -> reqwest::Result<reqwest::Response> {
    let request = client.get(url).build()?;
    let response = client.execute(request).await?.error_for_status()?;
    Ok(response)
}
async fn request_and_body(client: &reqwest::Client, url: &str) -> reqwest::Result<String> {
    let res = do_request(client, url).await?;
    res.text().await
}
pub async fn fetch_body(client: &reqwest::Client, url: &str) -> reqwest::Result<String> {
    get_fetch_retry_policy()
        .retry_if(|| request_and_body(client, url), retry_if_wasnt_not_found)
        .await
}

pub fn get_fetch_retry_policy() -> again::RetryPolicy {
    RetryPolicy::exponential(Duration::from_millis(300))
        .with_max_retries(20)
        .with_max_delay(Duration::from_secs(40))
        .with_jitter(true)
}

pub fn get_parse_retry_policy() -> again::RetryPolicy {
    RetryPolicy::exponential(Duration::from_millis(1500))
        .with_max_retries(5)
        .with_max_delay(Duration::from_secs(5))
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
    async fn fetch_and_scrap(
        client: &reqwest::Client,
        url: String,
    ) -> Result<PrecioPoint, anyhow::Error> {
        let body = fetch_body(client, &url).await?;
        let maybe_point = { scrap_url(client, url, &body).await };

        let point = match maybe_point {
            Ok(p) => Ok(p),
            Err(err) => {
                let now: DateTime<Utc> = Utc::now();
                // let debug_path = PathBuf::from(format!("debug-{}/", now.format("%Y-%m-%d")));
                // tokio::fs::create_dir_all(&debug_path).await.unwrap();
                // let file_path = debug_path.join(format!("{}.html", nanoid!()));
                // tokio::fs::write(&file_path, &body).await.unwrap();
                // tracing::debug!(error=%err, "Failed to parse, saved body at {}",file_path.display());
                tracing::debug!(error=%err, "Failed to parse");
                Err(err)
            }
        }?;

        Ok(point)
    }

    get_parse_retry_policy()
        .retry_if(
            || fetch_and_scrap(client, url.clone()),
            |err: &anyhow::Error| match err.downcast_ref::<reqwest::Error>() {
                Some(e) => !e.status().is_some_and(|s| s == StatusCode::NOT_FOUND),
                None => true,
            },
        )
        .await
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
        Supermercado::Farmacity => sites::farmacity::get_urls().await?,
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
        "www.farmacity.com" => {
            sites::farmacity::parse(url, &tl::parse(body, tl::ParserOptions::default())?)
        }
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
    db: Db,
    telegram: Option<AutoTelegram>,
    args: AutoArgs,
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
            let mut links = self.db.get_urls_by_domain(supermercado.host()).await?;
            if let Some(n) = self.args.n_products {
                links.truncate(n);
            }
            links
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
            let counters = fetch_list(&self.db, links).await;
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
        self.db.save_producto_urls(urls).await?;
        Ok(())
    }

    async fn inform(&self, msg: &str) {
        tracing::info!("{}", msg);
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

async fn auto_cli(args: AutoArgs) -> anyhow::Result<()> {
    let auto = {
        let db = Db::connect().await?;
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
        Auto { db, telegram, args }
    };
    auto.inform("[auto] Empezando scrap").await;

    let supermercados = match args.only_supermercado {
        Some(supermercado) => [supermercado].to_vec(),
        None => Supermercado::value_variants().to_vec(),
    };

    let handles: Vec<_> = supermercados
        .iter()
        .map(|s| tokio::spawn(auto.clone().download_supermercado(s.to_owned())))
        .collect();
    future::try_join_all(handles).await?;
    auto.inform("[auto] Download supermercados finished").await;

    let best_selling = auto
        .inform_time(
            "Downloaded best selling",
            best_selling::get_all_best_selling(&auto.db),
        )
        .await?;
    auto.db.save_best_selling(best_selling).await?;

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
        auto_cli(AutoArgs {
            n_products: None,
            only_supermercado: None,
        })
        .await
        .unwrap();
    }
}

mod sites;

#[derive(Debug)]
struct PrecioPoint {
    ean: String,
    // unix
    fetched_at: i64,
    precio_centavos: Option<i64>,
    in_stock: Option<bool>,
    url: String,
    parser_version: u16,
    name: Option<String>,
    image_url: Option<String>,
}

fn now_sec() -> i64 {
    since_the_epoch().as_secs().try_into().unwrap()
}
fn since_the_epoch() -> Duration {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
}
