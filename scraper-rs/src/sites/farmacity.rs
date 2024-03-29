use anyhow::Context;
use simple_error::bail;

use crate::sites::common;
use crate::PrecioPoint;

use super::vtex;
use super::vtex::find_product_ld;
use super::vtex::AvailabilityLd;

pub fn parse(url: String, dom: &tl::VDom) -> Result<PrecioPoint, anyhow::Error> {
    let ean = common::get_meta_content(dom, "product:retailer_item_id")
        .context("Parsing EAN")?
        .to_string();
    let precio_centavos = common::price_from_meta(dom)?;

    let (name, image_url, in_stock) = match find_product_ld(dom) {
        Some(pm) => {
            let p = pm?;
            (
                Some(p.name),
                Some(p.image),
                Some(
                    p.offers.offers.first().context("No offer")?.availability
                        == AvailabilityLd::InStock,
                ),
            )
        }
        None => bail!("No JSON/LD"),
    };

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

pub async fn get_urls() -> anyhow::Result<Vec<String>> {
    let urls = vec![
        "https://www.farmacity.com/sitemap/product-0.xml",
        "https://www.farmacity.com/sitemap/product-1.xml",
    ];
    vtex::get_urls_from_sitemap(urls).await
}
