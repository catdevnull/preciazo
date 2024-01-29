use std::str::FromStr;

use anyhow::{bail, Context};
use base64::Engine;
use futures::{stream, StreamExt, TryStreamExt};
use itertools::Itertools;
use reqwest::Url;
use serde::Deserialize;
use serde_json::json;
use simple_error::SimpleError;
use tl::VDom;

use crate::{build_client, do_request, get_retry_policy, retry_if_wasnt_not_found};

use super::common;

pub fn parse_script_json(dom: &VDom, varname: &str) -> Result<serde_json::Value, anyhow::Error> {
    let inner_html = &dom
        .query_selector("template[data-type=\"json\"]")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()).and_then(|n| n.as_tag()))
        .find(|t| {
            t.attributes()
                .get("data-varname")
                .flatten()
                .map_or(false, |v| v.as_utf8_str() == varname)
        })
        .ok_or(SimpleError::new("Failed to get template tag"))?
        .query_selector(dom.parser(), "script")
        .and_then(|mut it| it.next())
        .and_then(|h| h.get(dom.parser()))
        .ok_or(SimpleError::new("Failed to get script tag"))?
        .inner_html(dom.parser());
    inner_html.parse().context("Couldn't parse JSON in script")
}

pub fn get_json_lds<'a>(
    dom: &'a VDom,
) -> impl Iterator<Item = std::result::Result<serde_json::Value, serde_json::Error>> + 'a {
    dom.query_selector("script[type=\"application/ld+json\"]")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .filter_map(|n| n.as_tag())
        .map(|t| serde_json::from_str(&t.inner_html(dom.parser())))
}
pub fn find_json_ld(dom: &VDom, typ: &str) -> Option<Result<Ld, serde_json::Error>> {
    get_json_lds(dom)
        .filter_map(|v| v.ok())
        .find(|v| v.get("@type").is_some_and(|t| t == typ))
        .map(serde_json::from_value)
}
pub fn find_product_ld(dom: &VDom) -> Option<Result<ProductLd, serde_json::Error>> {
    find_json_ld(dom, "Product").map(|l| {
        l.map(|l| match l {
            Ld::Product(p) => p,
        })
    })
}

#[derive(Deserialize)]
#[serde(tag = "@type")]
pub enum Ld {
    Product(ProductLd),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductLd {
    pub name: String,
    pub image: String,
    pub sku: Option<String>,
    pub offers: OffersLd,
}
#[derive(Deserialize)]
pub struct OffersLd {
    pub offers: Vec<OfferLd>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferLd {
    #[serde(rename = "@type")]
    _type: OfferTypeLd,
    pub price: f64,
    pub price_currency: String,
    pub availability: AvailabilityLd,
}
#[derive(Deserialize)]
pub enum OfferTypeLd {
    Offer,
}
#[derive(Deserialize, PartialEq)]
pub enum AvailabilityLd {
    #[serde(rename = "http://schema.org/InStock")]
    InStock,
    #[serde(rename = "http://schema.org/OutOfStock")]
    OutOfStock,
}

pub fn in_stock_from_meta(dom: &VDom) -> anyhow::Result<bool> {
    Ok(
        match common::get_meta_content(dom, "product:availability") {
            Some(s) => match s.as_ref() {
                "oos" => false,
                "instock" => true,
                _ => bail!("Not a valid product:availability"),
            },
            None => bail!("No product:availability in vtex"),
        },
    )
}

fn parse_urls_from_sitemap(sitemap: &str) -> anyhow::Result<Vec<String>> {
    let dom = tl::parse(sitemap, tl::ParserOptions::default())?;
    dom.query_selector("loc")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .filter_map(|n| n.as_tag())
        .map(|t| t.inner_text(dom.parser()))
        .map(|s| -> anyhow::Result<String> {
            Ok(quick_xml::escape::unescape(s.as_ref())?.to_string())
        })
        .try_collect()
}

pub async fn get_urls_from_sitemap(sitemaps: Vec<&str>) -> anyhow::Result<Vec<String>> {
    let mut total: Vec<String> = vec![];
    let client = build_client();
    let handles = stream::iter(sitemaps)
        .map(|url| {
            let client = client.clone();
            let url = url.to_string();
            async move {
                let client = client;
                let text = get_retry_policy()
                    .retry_if(|| do_request(&client, &url), retry_if_wasnt_not_found)
                    .await?
                    .text()
                    .await?;
                parse_urls_from_sitemap(&text)
            }
        })
        // https://github.com/rust-lang/rust/issues/89976#issuecomment-1073115246
        .boxed()
        .buffer_unordered(8)
        .try_collect::<Vec<_>>()
        .await?;
    for mut urls in handles {
        total.append(&mut urls);
    }
    Ok(total.into_iter().unique().collect())
}

async fn fetch_body<'a>(client: &reqwest::Client, url: &str) -> anyhow::Result<String> {
    let body = get_retry_policy()
        .retry_if(|| do_request(client, url), retry_if_wasnt_not_found)
        .await?
        .text()
        .await?;
    Ok(body)
}

async fn get_binding_id(client: &reqwest::Client, url: &str) -> anyhow::Result<String> {
    let body = fetch_body(client, url).await?;
    let dom = tl::parse(&body, tl::ParserOptions::default())?;
    let json = parse_script_json(&dom, "__RUNTIME__")?;
    let id = json
        .as_object()
        .ok_or(SimpleError::new("RUNTIME not an object"))?
        .get("binding")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("id"))
        .and_then(|v| v.as_str())
        .ok_or(SimpleError::new("binding.id does not exist"))?
        .to_string();
    Ok(id)
}

/// Returns a vec of product URLs
///
/// Estos parametros se consiguen yendo a una página como `https://www.jumbo.com.ar/almacen` y extrayendo:
/// * `domain` - www.jumbo.com.ar
/// * `query` - almacen
///
/// También `https://diaonline.supermercadosdia.com.ar/frescos/frutas-y-verduras`:
/// * `domain` - diaonline.supermercadosdia.com.ar
/// * `query` - frescos/frutas-y-verduras
pub async fn get_best_selling_by_category(
    client: &reqwest::Client,
    domain: &str,
    query: &str,
) -> anyhow::Result<Vec<String>> {
    let base_url = { Url::from_str(&format!("https://{}/{}", domain, query)).unwrap() };

    let binding_id = get_binding_id(client, base_url.as_str()).await?;
    let url = {
        let mut url = base_url.clone();
        url.set_path("/_v/segment/graphql/v1");
        url.query_pairs_mut().append_pair("workspace", "master")
            .append_pair("maxAge", "short")
            .append_pair("appsEtag", "remove")
            .append_pair("domain", "store")
            .append_pair("locale", "es-AR")
            .append_pair("__bindingId", &binding_id)
            .append_pair("operationName", "productSearchV3")
            .append_pair("variables", "%7B%7D")
            .append_pair("extensions", &{
                let variables_obj = json!({"hideUnavailableItems":true,"skusFilter":"FIRST_AVAILABLE","simulationBehavior":"default","installmentCriteria":"MAX_WITHOUT_INTEREST","productOriginVtex":false,"map":"c","query":query,"orderBy":"OrderByTopSaleDESC","from":0,"to":99,"selectedFacets":
                    query.split('/').map(|f| json!({"key":"c","value":f})).collect::<Vec<_>>()
                ,"facetsBehavior":"Static","categoryTreeBehavior":"default","withFacets":false});
                let b64=base64::prelude::BASE64_STANDARD.encode(variables_obj.to_string());

                format!(
                    r#"{{
                        "persistedQuery": {{
                            "version": 1,
                            "sha256Hash": "40b843ca1f7934d20d05d334916220a0c2cae3833d9f17bcb79cdd2185adceac",
                            "sender": "vtex.store-resources@0.x",
                            "provider": "vtex.search-graphql@0.x"
                        }},
                        "variables": "{}"
                    }}"#, b64
                )
            });
        url
    };
    let body = fetch_body(client, url.as_str()).await?;
    let urls: Vec<String> = serde_json::from_str::<serde_json::Value>(&body)?
        .pointer("/data/productSearch/products")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|p| {
                    p.get("link")
                        .and_then(|v| v.as_str())
                        .map(|s| format!("https://{}{}", domain, s))
                })
                .collect()
        })
        .ok_or(SimpleError::new("failed to get best selling product urls"))?;

    if urls.len() < 2 {
        bail!("Too few best selling");
    }

    Ok(urls)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_url() -> anyhow::Result<()> {
        let links = parse_urls_from_sitemap(
            r#"
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url>
    <loc>https://www.carrefour.com.ar/postre-danette-mousse-dulce-de-leche-80-g&#x200B;-684952/p</loc>
    <lastmod>2024-01-12T10:41:25.962Z</lastmod>
</url>"#,
        )?;
        assert_eq!(links[0], "https://www.carrefour.com.ar/postre-danette-mousse-dulce-de-leche-80-g\u{200b}-684952/p");
        Ok(())
    }

    #[tokio::test]
    async fn test_jumbo_best_selling() -> anyhow::Result<()> {
        get_best_selling_by_category(&build_client(), "www.jumbo.com.ar", "almacen").await?;
        // assert_eq!(links[0], "https://www.carrefour.com.ar/postre-danette-mousse-dulce-de-leche-80-g\u{200b}-684952/p");
        Ok(())
    }
}
