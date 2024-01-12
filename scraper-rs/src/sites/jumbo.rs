use std::str::FromStr;

use anyhow::Context;
use reqwest::Url;
use serde::Deserialize;
use simple_error::bail;

use crate::sites::common;
use crate::PrecioPoint;

use super::vtex;

#[derive(Deserialize)]
struct JumboSearch {
    items: Vec<JumboSearchItem>,
}
#[derive(Deserialize)]
struct JumboSearchItem {
    ean: String,
}

async fn get_ean_from_search(
    client: &reqwest::Client,
    retailer_sku: String,
) -> anyhow::Result<String> {
    let s = client
        .get({
            let mut url =
                Url::from_str("https://www.jumbo.com.ar/api/catalog_system/pub/products/search")
                    .unwrap();
            url.set_query(Some(&format!("fq=skuId:{}", retailer_sku)));
            url
        })
        .send()
        .await?
        .text()
        .await?;
    let ean = {
        let search: Vec<JumboSearch> = serde_json::from_str(&s)?;
        let result = search.first().context("No search result")?;
        let ean = result
            .items
            .first()
            .context("No search result")?
            .ean
            .clone();
        if !result.items.iter().all(|i| i.ean == ean) {
            bail!("Inesperado: no todos los items tienen el mismo EAN")
        }
        ean
    };
    Ok(ean)
}

pub async fn scrap(
    client: &reqwest::Client,
    url: String,
    body: &str,
) -> Result<PrecioPoint, anyhow::Error> {
    let (name, image_url, sku, precio_centavos, in_stock) = {
        let dom = tl::parse(body, tl::ParserOptions::default())?;
        let precio_centavos = common::price_from_meta(&dom)?;
        let in_stock = vtex::in_stock_from_meta(&dom)?;

        match vtex::find_product_ld(&dom) {
            Some(pm) => {
                let p = pm?;
                (
                    Some(p.name),
                    Some(p.image),
                    p.sku.context("No retailer SKU in Product LD")?,
                    precio_centavos,
                    in_stock,
                )
            }
            None => bail!("No JSON/LD"),
        }
    };

    let ean = get_ean_from_search(client, sku).await?;

    Ok(PrecioPoint {
        ean,
        fetched_at: crate::now_sec(),
        in_stock: Some(in_stock),
        name,
        image_url,
        parser_version: 5,
        precio_centavos,
        url,
    })
}

pub async fn get_urls() -> anyhow::Result<Vec<String>> {
    // de https://www.jumbo.com.ar/sitemap.xml
    let urls = vec![
        "https://www.jumbo.com.ar/sitemap/product-1.xml",
        "https://www.jumbo.com.ar/sitemap/product-10.xml",
        "https://www.jumbo.com.ar/sitemap/product-11.xml",
        "https://www.jumbo.com.ar/sitemap/product-12.xml",
        "https://www.jumbo.com.ar/sitemap/product-13.xml",
        "https://www.jumbo.com.ar/sitemap/product-14.xml",
        "https://www.jumbo.com.ar/sitemap/product-15.xml",
        "https://www.jumbo.com.ar/sitemap/product-2.xml",
        "https://www.jumbo.com.ar/sitemap/product-3.xml",
        "https://www.jumbo.com.ar/sitemap/product-4.xml",
        "https://www.jumbo.com.ar/sitemap/product-5.xml",
        "https://www.jumbo.com.ar/sitemap/product-6.xml",
        "https://www.jumbo.com.ar/sitemap/product-7.xml",
        "https://www.jumbo.com.ar/sitemap/product-8.xml",
        "https://www.jumbo.com.ar/sitemap/product-9.xml",
    ];
    vtex::get_urls_from_sitemap(urls).await
}
