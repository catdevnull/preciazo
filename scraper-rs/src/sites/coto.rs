use again::Task;
use anyhow::{anyhow, Context};
use futures::{stream, StreamExt, TryFutureExt, TryStreamExt};
use itertools::Itertools;
use reqwest::Url;

use crate::{
    anyhow_retry_if_wasnt_not_found, get_fetch_retry_policy, proxy_client::ProxyClient,
    retry_if_wasnt_not_found, PrecioPoint,
};

pub fn parse(url: String, dom: &tl::VDom) -> Result<PrecioPoint, anyhow::Error> {
    let ean = dom
        .query_selector("div#brandText")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .filter_map(|n| n.as_tag())
        .find(|t| t.inner_text(dom.parser()).as_ref().contains("| EAN: "))
        .context("No encuentro eanparent")?
        .query_selector(dom.parser(), "span.span_codigoplu")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .filter_map(|n| n.as_tag())
        .nth(1)
        .context("no encuentro el ean")?
        .inner_text(dom.parser())
        .trim()
        .to_string();

    let precio_centavos = dom
        .query_selector(".atg_store_newPrice")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .find_map(|n| n.as_tag())
        .map(|t| t.inner_text(dom.parser()))
        .filter(|s| !s.is_empty())
        .map(|s| {
            let s = s.replacen('$', "", 1).replace('.', "").replace(',', ".");
            let s = s.trim();
            s.parse::<f64>()
        })
        .transpose()
        .context("Parseando precio")?
        .map(|f| (f * 100.0) as i64);

    let in_stock = Some(
        dom.query_selector(".product_not_available")
            .unwrap()
            .filter_map(|h| h.get(dom.parser()))
            .find_map(|n| n.as_tag())
            .is_some(),
    );

    let name = dom
        .query_selector("h1.product_page")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .find_map(|n| n.as_tag())
        .map(|t| t.inner_text(dom.parser()))
        // https://github.com/catdevnull/preciazo/issues/24
        .map(|s| html_escape::decode_html_entities(s.trim()).to_string());

    let image_url = dom
        .query_selector(".zoomImage1")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .find_map(|n| n.as_tag())
        .and_then(|t| t.attributes().get("src").flatten())
        .map(|s| s.as_utf8_str().to_string());

    Ok(PrecioPoint {
        ean,
        fetched_at: crate::now_sec(),
        in_stock,
        name,
        image_url,
        parser_version: 5,
        precio_centavos,
        url,
    })
}

pub async fn get_urls(proxy_client: &ProxyClient) -> anyhow::Result<Vec<String>> {
    let initial = Url::parse("https://www.cotodigital3.com.ar/sitios/cdigi/browse?Nf=product.endDate%7CGTEQ+1.7032032E12%7C%7Cproduct.startDate%7CLTEQ+1.7032032E12&Nr=AND%28product.sDisp_200%3A1004%2Cproduct.language%3Aespa%C3%B1ol%2COR%28product.siteId%3ACotoDigital%29%29")?;

    let page_size = 50;
    let handles: Vec<Vec<String>> = stream::iter(0..29000 / page_size)
        .map(|i| {
            let mut u = initial.clone();
            u.query_pairs_mut()
                .append_pair("No", &(i * page_size).to_string())
                .append_pair("Nrpp", &(page_size).to_string())
                .finish();
            async move {
                let text: String = get_fetch_retry_policy()
                    .retry_if(
                        || {
                            async fn asdf(
                                proxy_client: &ProxyClient,
                                url: Url,
                            ) -> anyhow::Result<String> {
                                let res = proxy_client.do_request(url).await?.error_for_status()?;
                                Ok(res.text().await?)
                            }
                            let url = u.clone();
                            asdf(proxy_client, url)
                        },
                        anyhow_retry_if_wasnt_not_found,
                    )
                    .await?;
                let dom = tl::parse(&text, tl::ParserOptions::default())?;

                let list: Vec<String> = dom
                    .query_selector(".product_info_container")
                    .unwrap()
                    .filter_map(|h| h.get(dom.parser()))
                    .filter_map(|n| n.as_tag())
                    .filter_map(|t| -> Option<anyhow::Result<String>> {
                        t.children()
                            .top()
                            .iter()
                            .filter_map(|h| h.get(dom.parser()))
                            .filter_map(|n| n.as_tag())
                            .find(|t| t.name() == "a")
                            .map(|t| {
                                t.attributes()
                                    .get("href")
                                    .flatten()
                                    .ok_or(anyhow!("No tiene href="))
                            })
                            .map(|s| {
                                Ok(Url::options()
                                    .base_url(Some(&Url::parse("https://www.cotodigital3.com.ar")?))
                                    .parse(s?.as_utf8_str().as_ref())?
                                    .to_string())
                            })
                    })
                    .try_collect()?;
                Ok::<Vec<String>, anyhow::Error>(list)
            }
        })
        .buffer_unordered(8)
        .try_collect()
        .await?;
    let mut total: Vec<String> = vec![];
    for mut urls in handles {
        total.append(&mut urls);
    }
    Ok(total.into_iter().unique().collect())
}
