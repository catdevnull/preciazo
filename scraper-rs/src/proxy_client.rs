use std::{collections::HashSet, str::FromStr, sync::Arc, time::Duration};

use anyhow::Context;
use futures::{future::join_all, stream, FutureExt, StreamExt};
use indicatif::ProgressBar;
use itertools::Itertools;
use proxy_scraper_checker::{Proxy, ProxyChecker};
use rand::Rng;
use reqwest::{IntoUrl, Url};
use serde::Deserialize;
use tokio::sync::{RwLock, Semaphore};

use crate::build_header_map;

#[derive(Default, Debug)]
pub struct ProxyClient {
    proxies: RwLock<Option<Vec<Url>>>,
    clients: RwLock<[Option<reqwest::Client>; 10]>,
}

impl ProxyClient {
    pub async fn do_request(&self, url: impl IntoUrl + Clone) -> anyhow::Result<reqwest::Response> {
        loop {
            let client = {
                let mut client_ptr = self.clients.write().await;
                if let Some(client) = (*client_ptr).clone() {
                    client
                } else {
                    let proxies = self.get_proxies().await?;
                    // let proxy = stream::iter(proxies)
                    //     .filter_map(|proxy| async {
                    //         println!("trying proxy {}", proxy);
                    //         check_proxy(
                    //             proxy.clone(),
                    //             "https://www.cotodigital3.com.ar/sitios/cdigi/".to_string(),
                    //             3,
                    //         )
                    //         .map(|r| r.ok())
                    //         .await
                    //     })
                    //     .next()
                    //     .await
                    //     .unwrap()
                    //     .clone();
                    let proxy = loop {
                        let proxy = proxies[rand::thread_rng().gen_range(0..proxies.len())].clone();
                        println!("trying proxy {}", proxy);
                        match check_proxy(
                            proxy,
                            "https://www.cotodigital3.com.ar/sitios/cdigi/".to_string(),
                            10,
                        )
                        .await
                        {
                            Ok(proxy) => break proxy,
                            Err(_) => continue,
                        }
                    };

                    println!("chose proxy {}", proxy);
                    let new_client = reqwest::ClientBuilder::default()
                        .timeout(Duration::from_secs(300))
                        .connect_timeout(Duration::from_secs(150))
                        .default_headers(build_header_map())
                        .proxy(reqwest::Proxy::all(proxy)?)
                        .build()
                        .unwrap();
                    let ret = new_client.clone();
                    *client_ptr = Some(new_client);
                    ret
                }
            };
            let req = client.get(url.clone()).build()?;
            match client.execute(req).await {
                Ok(res) => return Ok(res),
                Err(_) => {
                    // possibly IP locked, reset client to get another IP
                    {
                        println!("request failed, resetting client");
                        *(self.clients.write().await) = None;
                    }
                }
            }
        }
    }

    pub async fn get_proxies(&self) -> anyhow::Result<Vec<Url>> {
        let mut proxies_ptr = self.proxies.write().await;
        if let Some(proxies) = (*proxies_ptr).clone() {
            Ok(proxies)
        } else {
            // let scraper = proxy_scraper_checker::ProxyScraper::default();

            // let archive_urls = scraper.scrape_archive_urls().await?;
            // let futures: Vec<_> = archive_urls
            //     .into_iter()
            //     .map(|url| {
            //         tokio::task::spawn({
            //             let value = scraper.clone();
            //             async move { value.scrape_proxies(url, true).await }
            //         })
            //     })
            //     .collect();
            // let results: Vec<_> = join_all(futures).await.into_iter().try_collect()?;
            // let proxies: Vec<_> = results
            //     .into_iter()
            //     .filter_map(|res| if let Ok(res) = res { Some(res) } else { None })
            //     .flatten()
            //     .filter(|x| {
            //         if let Proxy::Socks5(_) = x {
            //             true
            //         } else {
            //             false
            //         }
            //     })
            //     .collect();

            let socks5_proxies = get_proxy_list_from_raw_list(
                "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt",
                "socks5",
            )
            .await?;
            let http_proxies = get_proxy_list_from_raw_list(
                "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
                "http",
            )
            .await?;
            let fosy_http_proxies =
                get_proxy_list_from_raw_list("https://fosy.club/api/free/list?type=http", "http")
                    .await?;
            let fosy_socks5_proxies = get_proxy_list_from_raw_list(
                "https://fosy.club/api/free/list?type=socks5",
                "socks5",
            )
            .await?;
            let geonode_proxies = get_proxy_list_geonode()
                .await
                .inspect_err(|e| tracing::error!("getting proxy list ({error})", error = e))?;

            // let proxies: Vec<_> = [
            //     // socks5_proxies,
            //     // http_proxies,
            //     fosy_http_proxies,
            //     fosy_socks5_proxies,
            //     geonode_proxies,
            // ]
            // .into_iter()
            // .flatten()
            // .collect();

            let checked_proxies: Vec<_> = {
                let proxiess: HashSet<_> = proxies
                    .into_iter()
                    .filter_map(|p| match p.scheme() {
                        "socks5" => Some(Proxy::Socks5(p.host_str()?.to_string())),
                        "http" => Some(Proxy::Http(p.host_str()?.to_string())),
                        _ => None,
                    })
                    .collect();
                let checker = ProxyChecker::new(
                    Arc::new(Semaphore::new(32)),
                    ProgressBar::new(proxiess.len().try_into().unwrap()),
                );
                checker
                    .check_proxies(proxiess.into(), "https://milei.nulo.in/".to_string(), 8)
                    .await?
                    .into_iter()
                    .map(|p| Url::from_str(&p.url()))
                    .try_collect()?
            };

            let ret = checked_proxies.clone();
            println!("got {} proxies", ret.len());
            *proxies_ptr = Some(checked_proxies);
            Ok(ret)
        }
    }
}

pub async fn check_proxy(proxy: Url, url: String, timeout: u64) -> anyhow::Result<Url> {
    let client = reqwest::Client::builder()
        .proxy(reqwest::Proxy::all(proxy.clone())?)
        .timeout(Duration::from_secs(timeout))
        .build()?;

    client
        .get(url)
        .send()
        .await
        .context("Request failed")?
        .error_for_status()
        .context("Request returned an error status code")?;

    Ok(proxy)
}

// pub async fn find_first_working_proxy(proxies: Vec<String>) -> anyhow::Result<Url> {
//     let semaphore = Arc::new(Semaphore::new(64));
//     for proxy in proxies {
//         let semaphore = semaphore.clone();

//     }

//                         let proxy = stream::iter(proxies)
//                         .filter_map(|proxy| async {
//                             println!("trying proxy {}", proxy);
//                             check_proxy(
//                                 proxy.clone(),
//                                 "https://www.cotodigital3.com.ar/sitios/cdigi/".to_string(),
//                                 3,
//                             )
//                             .map(|r| r.ok())
//                             .await
//                         }).concu
//                         .next()
//                         .await
//                         .unwrap()
//                         .clone();

// }

pub async fn get_proxy_list_from_raw_list<U: IntoUrl>(
    list_url: U,
    protocol: &str,
) -> anyhow::Result<Vec<Url>> {
    let res = reqwest::get(list_url).await?;
    let text = res.text().await?;
    Ok(text
        .lines()
        .map(|l| Url::from_str(&format!("{}://{}", protocol, l)))
        .filter_map(|r| r.ok())
        .collect())
}

#[derive(Deserialize)]
struct Ips {
    data: Vec<Ip>,
}
#[derive(Deserialize)]
struct Ip {
    ip: String,
    port: String,
    protocols: Vec<String>,
}
pub async fn get_proxy_list_geonode() -> anyhow::Result<Vec<Url>> {
    let ips = reqwest::get("https://proxylist.geonode.com/api/proxy-list?protocols=socks5%2Chttp&filterUpTime=90&limit=500&page=1&sort_by=lastChecked&sort_type=asc").await?.json::<Ips>().await?;
    Ok(ips
        .data
        .into_iter()
        .map(|i| Url::from_str(&format!("{}://{}:{}", i.protocols[0], i.ip, i.port)))
        .filter_map(|r| r.ok())
        .collect())
}
pub async fn get_proxy_list_checkerproxy() -> anyhow::Result<Vec<Url>> {
    let scraper = proxy_scraper_checker::ProxyScraper::default();
    let archive_urls = scraper.scrape_archive_urls().await?;
    let futures: Vec<_> = archive_urls
        .into_iter()
        .map(|url| {
            tokio::task::spawn({
                let value = scraper.clone();
                async move { value.scrape_proxies(url, true).await }
            })
        })
        .collect();
    let results: Vec<_> = join_all(futures).await.into_iter().try_collect()?;
    let proxies: Vec<_> = results
        .into_iter()
        .filter_map(|res| if let Ok(res) = res { Some(res) } else { None })
        .flatten()
        .map(|p| Url::from_str(&p.url()))
        .try_collect()?;
    Ok(proxies)
}
