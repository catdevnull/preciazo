use std::time::Duration;

use itertools::Itertools;
use rand::Rng;
use reqwest::{IntoUrl, Url};

use crate::build_header_map;

#[derive(Debug, Clone)]
pub struct ProxyClient {
    // proxies: Vec<Url>,
    clients: Vec<reqwest::Client>,
}

impl ProxyClient {
    pub fn from_proxy_list(proxies: &str) -> anyhow::Result<Self> {
        let proxies = Self::parse_proxy_list(proxies)?;
        let clients = if proxies.is_empty() {
            tracing::warn!("No proxies available; using no proxy");
            vec![Self::client_builder().build()?]
        } else {
            proxies
                .clone()
                .into_iter()
                .map(Self::build_client_with_proxy)
                .try_collect()?
        };
        Ok(Self { clients })
    }

    fn parse_proxy_list(proxies: &str) -> anyhow::Result<Vec<Url>> {
        Ok(proxies
            .split("\n")
            .filter(|s| !s.trim().is_empty())
            .map(Url::parse)
            .try_collect()?)
    }
    fn client_builder() -> reqwest::ClientBuilder {
        reqwest::ClientBuilder::default()
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(150))
            .default_headers(build_header_map())
    }
    fn build_client_with_proxy(proxy: Url) -> reqwest::Result<reqwest::Client> {
        Self::client_builder()
            .proxy(reqwest::Proxy::all(proxy)?)
            .build()
    }

    pub async fn do_request(
        &self,
        url: impl IntoUrl + Clone,
    ) -> reqwest::Result<reqwest::Response> {
        let client = self.clients[rand::thread_rng().gen_range(0..self.clients.len())].clone();
        let req = client.get(url.clone()).build()?;
        client.execute(req).await
    }
}
