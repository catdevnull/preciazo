use std::env;

use futures::{future, stream, StreamExt};
use reqwest::{StatusCode, Url};
use simple_error::bail;
use tokio::fs;

use crate::{
    anyhow_retry_if_wasnt_not_found, build_client, db::Db, get_fetch_retry_policy,
    get_parse_retry_policy, proxy_client::ProxyClient, sites, Counters, PrecioPoint,
};
use preciazo::supermercado::Supermercado;

#[derive(Debug, Clone)]
pub struct Scraper {
    default_client: reqwest::Client,
    proxy_client: ProxyClient,
}

impl Scraper {
    pub async fn from_env() -> anyhow::Result<Self> {
        let proxy_list = match env::var("PROXY_LIST") {
            Ok(list) => list,
            Err(_) => match env::var("PROXY_LIST_PATH") {
                Ok(path) => fs::read_to_string(path).await?,
                Err(_) => "".to_owned(),
            },
        };
        Self::build(&proxy_list)
    }
    pub fn build(proxy_list: &str) -> anyhow::Result<Self> {
        Ok(Self {
            default_client: build_client(),
            proxy_client: ProxyClient::from_proxy_list(proxy_list)?,
        })
    }

    pub async fn get_urls_for_supermercado(
        &self,
        supermercado: &Supermercado,
    ) -> anyhow::Result<Vec<String>> {
        match supermercado {
            Supermercado::Dia => sites::dia::get_urls().await,
            Supermercado::Jumbo => sites::jumbo::get_urls().await,
            Supermercado::Carrefour => sites::carrefour::get_urls().await,
            Supermercado::Coto => sites::coto::get_urls(&self.proxy_client).await,
            Supermercado::Farmacity => sites::farmacity::get_urls().await,
        }
    }

    #[tracing::instrument(skip(self))]
    pub async fn fetch_and_scrap(&self, url: String) -> Result<PrecioPoint, anyhow::Error> {
        async fn fetch_and_scrap(
            scraper: &Scraper,
            url: String,
        ) -> Result<PrecioPoint, anyhow::Error> {
            let body = scraper.fetch_body(&url).await?;
            let maybe_point = { scraper.scrap_url(url, &body).await };

            let point = match maybe_point {
                Ok(p) => Ok(p),
                Err(err) => {
                    // let now: DateTime<Utc> = Utc::now();
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
                || fetch_and_scrap(self, url.clone()),
                anyhow_retry_if_wasnt_not_found,
            )
            .await
    }

    async fn fetch_body(&self, url_string: &str) -> anyhow::Result<String> {
        let url = Url::parse(url_string)?;

        get_fetch_retry_policy()
            .retry_if(
                || self.request_and_body(url.clone()),
                anyhow_retry_if_wasnt_not_found,
            )
            .await
    }

    async fn request_and_body(&self, url: Url) -> anyhow::Result<String> {
        let res = match Supermercado::from_url(&url) {
            Some(Supermercado::Coto) => self.proxy_client.do_request(url).await?,
            _ => self
                .default_client
                .execute(self.default_client.get(url).build()?)
                .await?
                .error_for_status()?,
        };
        Ok(res.text().await?)
    }

    pub async fn fetch_and_save(&self, url: String, db: Db) -> Counters {
        let res = self.fetch_and_scrap(url.clone()).await;
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

    pub async fn fetch_list(&self, db: &Db, links: Vec<String>, n_coroutines: usize) -> Counters {
        stream::iter(links)
            .map(|url| {
                let db = db.clone();
                let scraper = self.clone();
                tokio::spawn(async move { scraper.fetch_and_save(url, db).await })
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

    pub async fn scrap_url(&self, url: String, res_body: &str) -> anyhow::Result<PrecioPoint> {
        let url_p = Url::parse(&url).unwrap();
        match Supermercado::from_url(&url_p) {
            Some(Supermercado::Carrefour) => {
                sites::carrefour::parse(url, &tl::parse(res_body, tl::ParserOptions::default())?)
            }
            Some(Supermercado::Dia) => {
                sites::dia::parse(url, &tl::parse(res_body, tl::ParserOptions::default())?)
            }
            Some(Supermercado::Coto) => {
                sites::coto::parse(url, &tl::parse(res_body, tl::ParserOptions::default())?)
            }
            Some(Supermercado::Jumbo) => {
                sites::jumbo::scrap(&self.default_client, url, res_body).await
            }
            Some(Supermercado::Farmacity) => {
                sites::farmacity::parse(url, &tl::parse(res_body, tl::ParserOptions::default())?)
            }
            None => bail!("Unknown URL host {}", url),
        }
    }
}
