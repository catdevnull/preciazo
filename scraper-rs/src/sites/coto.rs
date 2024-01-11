use anyhow::Context;

use crate::PrecioPoint;

#[tracing::instrument(skip(dom))]
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
        .filter_map(|n| n.as_tag())
        .next()
        .map(|t| t.inner_text(dom.parser()))
        .filter(|s| !s.is_empty())
        .map(|s| {
            let s = s.replacen('$', "", 1).replace('.', "").replace(',', ".");
            let s = s.trim();
            s.parse::<f64>()
        })
        .transpose()
        .context("Parseando precio")?
        .map(|f| (f * 100.0) as u64);

    let in_stock = Some(
        dom.query_selector(".product_not_available")
            .unwrap()
            .filter_map(|h| h.get(dom.parser()))
            .filter_map(|n| n.as_tag())
            .next()
            .is_some(),
    );

    let name = dom
        .query_selector("h1.product_page")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .filter_map(|n| n.as_tag())
        .next()
        .map(|t| t.inner_text(dom.parser()))
        .map(|s| s.trim().to_string());

    let image_url = dom
        .query_selector(".zoom img")
        .unwrap()
        .filter_map(|h| h.get(dom.parser()))
        .filter_map(|n| n.as_tag())
        .next()
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
