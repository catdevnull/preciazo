use std::sync::Arc;

use reqwest::Url;
use simple_error::bail;

use crate::{
    anyhow_retry_if_wasnt_not_found, build_client, get_fetch_retry_policy, get_parse_retry_policy,
    proxy_client::ProxyClient, sites, supermercado::Supermercado, PrecioPoint,
};

#[derive(Debug, Clone)]
pub struct Scraper {
    default_client: reqwest::Client,
    proxy_client: Arc<ProxyClient>,
}

impl Scraper {
    pub fn new() -> Self {
        Self {
            default_client: build_client(),
            proxy_client: ProxyClient::default().into(),
        }
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
    pub async fn fetch_and_parse(&self, url: String) -> Result<PrecioPoint, anyhow::Error> {
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
