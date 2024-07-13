use again::RetryPolicy;
use clap::{Parser, ValueEnum};
use cron::Schedule;
use db::Db;
use futures::{future, TryFutureExt};

use reqwest::{header::HeaderMap, IntoUrl, StatusCode};
use scraper::Scraper;
use simple_error::SimpleError;
use std::{
    env::{self},
    fs,
    str::FromStr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use thiserror::Error;

use preciazo::supermercado::Supermercado;
mod auto;
use auto::Auto;
mod proxy_client;
mod scraper;

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
async fn main() {
    tracing_subscriber::fmt::init();

    preciazo::db::connect_db().await.unwrap();

    // match Args::parse() {
    //     Args::FetchList(a) => fetch_list_cli(a.list_path).await,
    //     Args::ParseFile(a) => parse_file_cli(a.file_path).await,
    //     Args::GetUrlList(a) => get_url_list_cli(a.supermercado).await,
    //     Args::ScrapUrl(a) => scrap_url_cli(a.url).await,
    //     Args::ScrapBestSelling => scrap_best_selling_cli().await,
    //     Args::Auto(a) => auto_cli(a).await,
    //     Args::Cron(_) => cron_cli().await,
    // }
    // .unwrap()
}

async fn scrap_url_cli(url: String) -> anyhow::Result<()> {
    let scraper = Scraper::from_env().await?;
    let res = scraper.fetch_and_scrap(url.clone()).await;

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
    let scraper = Scraper::from_env().await?;
    let counters = scraper.fetch_list(&db, links).await;

    println!("Finished: {:?}", counters);
    Ok(())
}

mod db;

#[derive(Default, Debug)]
struct Counters {
    success: u64,
    errored: u64,
    skipped: u64,
}

#[derive(Debug, Error)]
enum FetchError {
    #[error("parse error")]
    Parse(#[from] SimpleError),
    #[error("tl error")]
    Tl(#[from] tl::ParseError),
}

fn get_user_agent() -> &'static str {
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
}
fn build_header_map() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.append("User-Agent", get_user_agent().parse().unwrap());
    headers
}

fn build_client() -> reqwest::Client {
    reqwest::ClientBuilder::default()
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(30))
        .default_headers(build_header_map())
        .build()
        .unwrap()
}
pub async fn do_request<U: IntoUrl>(
    client: &reqwest::Client,
    url: U,
) -> reqwest::Result<reqwest::Response> {
    let request = client.get(url).build()?;
    let response = client.execute(request).await?.error_for_status()?;
    Ok(response)
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
    !err.status()
        .is_some_and(|s| s == StatusCode::NOT_FOUND || s == StatusCode::FORBIDDEN)
}
pub fn anyhow_retry_if_wasnt_not_found(err: &anyhow::Error) -> bool {
    match err.downcast_ref::<reqwest::Error>() {
        Some(e) => retry_if_wasnt_not_found(e),
        None => true,
    }
}

async fn parse_file_cli(file_path: String) -> anyhow::Result<()> {
    let file = tokio::fs::read_to_string(file_path).await?;

    let scraper = Scraper::from_env().await?;

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
    println!("{:?}", scraper.scrap_url(url, &file).await);
    Ok(())
}

async fn get_url_list_cli(supermercado: Supermercado) -> anyhow::Result<()> {
    let scraper = Scraper::from_env().await?;
    let urls = scraper.get_urls_for_supermercado(&supermercado).await?;
    urls.iter().for_each(|s| {
        println!("{}", s);
    });

    Ok(())
}

#[derive(Clone)]
struct AutoTelegram {
    token: String,
    chat_id: String,
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
        Auto {
            db,
            telegram,
            args,
            scraper: Scraper::from_env().await?,
        }
    };
    auto.inform("[auto] Empezando scrap").await;

    let supermercados = match args.only_supermercado {
        Some(supermercado) => [supermercado].to_vec(),
        None => Supermercado::value_variants().to_vec(),
    };

    let handles: Vec<_> = supermercados
        .iter()
        .map(|s| {
            let x = *s;
            tokio::spawn(
                auto.clone()
                    .download_supermercado(s.to_owned())
                    .inspect_err(move |err| {
                        tracing::error!(error=%err, supermercado=?x);
                    }),
            )
        })
        .collect();
    future::try_join_all(handles).await?;
    auto.inform("[auto] Download supermercados finished").await;

    auto.download_best_selling().await?;

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
