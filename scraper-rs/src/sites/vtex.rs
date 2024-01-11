use anyhow::Context;
use serde::Deserialize;
use simple_error::SimpleError;
use tl::VDom;

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
