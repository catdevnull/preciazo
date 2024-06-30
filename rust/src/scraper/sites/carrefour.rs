use simple_error::bail;
use simple_error::SimpleError;

use crate::sites::common;
use crate::sites::vtex;
use crate::PrecioPoint;

use super::vtex::find_product_ld;

pub fn parse(url: String, dom: &tl::VDom) -> Result<PrecioPoint, anyhow::Error> {
    let precio_centavos = common::price_from_meta(dom)?;

    let in_stock = vtex::in_stock_from_meta(dom)?;

    let ean = {
        let json = &vtex::parse_script_json(dom, "__STATE__")?;
        let state = json
            .as_object()
            .ok_or(SimpleError::new("Seed state not an object"))?;
        if state.is_empty() {
            bail!("Seed state is an empty object")
        }
        let (_, product_json) = state
            .iter()
            .find(|(key, val)| {
                key.starts_with("Product:") && val.get("__typename").is_some_and(|t| t == "Product")
            })
            .ok_or(SimpleError::new("No product in seed state"))?;
        let cache_id = product_json
            .get("cacheId")
            .and_then(|v| v.as_str())
            .ok_or(SimpleError::new("No cacheId in seed state"))?;
        let (_, product_sku_json) = state
            .iter()
            .find(|(key, val)| {
                key.starts_with(&format!("Product:{}", cache_id))
                    && val.get("__typename").is_some_and(|t| t == "SKU")
            })
            .ok_or(SimpleError::new("No Product:cacheId* found"))?;
        product_sku_json
            .get("ean")
            .and_then(|v| v.as_str())
            .ok_or(SimpleError::new("No product SKU in seed state"))?
            .to_string()
    };

    let (name, image_url) = match find_product_ld(dom) {
        Some(pm) => {
            let p = pm?;
            (Some(p.name), Some(p.image))
        }
        None => match in_stock {
            true => bail!("No JSONLD product in in stock product"),
            false => (None, None),
        },
    };

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
    let urls = vec![
        "https://www.carrefour.com.ar/sitemap/product-0.xml",
        "https://www.carrefour.com.ar/sitemap/product-1.xml",
        "https://www.carrefour.com.ar/sitemap/product-2.xml",
        "https://www.carrefour.com.ar/sitemap/product-3.xml",
        "https://www.carrefour.com.ar/sitemap/product-4.xml",
        "https://www.carrefour.com.ar/sitemap/product-5.xml",
        "https://www.carrefour.com.ar/sitemap/product-6.xml",
        "https://www.carrefour.com.ar/sitemap/product-7.xml",
        "https://www.carrefour.com.ar/sitemap/product-8.xml",
        "https://www.carrefour.com.ar/sitemap/product-9.xml",
    ];
    vtex::get_urls_from_sitemap(urls).await
}
