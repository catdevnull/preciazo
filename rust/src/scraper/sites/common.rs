use std::borrow::Cow;

use tl::VDom;

pub fn get_meta_content<'a>(dom: &'a VDom<'a>, prop: &str) -> Option<Cow<'a, str>> {
    dom.query_selector(&format!("meta[property=\"{}\"]", prop))
        .and_then(|mut iter| iter.next())
        .and_then(|h| h.get(dom.parser()))
        .and_then(|n| n.as_tag())
        .and_then(|tag| tag.attributes().get("content").flatten())
        .map(|s| s.as_utf8_str())
}

pub fn price_from_meta(dom: &tl::VDom<'_>) -> Result<Option<i64>, anyhow::Error> {
    let precio_centavos = get_meta_content(dom, "product:price:amount")
        .map(|s| s.parse::<f64>().map(|f| (f * 100.0) as i64))
        .transpose()?;
    Ok(precio_centavos)
}
