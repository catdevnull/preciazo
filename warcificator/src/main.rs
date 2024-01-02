use async_channel::{Receiver, Sender};
use rusqlite::Connection;
use scraper::{Element, Html, Selector};
use std::{
    env::args,
    fs,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::io::{stderr, AsyncWriteExt};

#[derive(Debug)]
struct PrecioPoint {
    ean: String,
    // unix
    fetched_at: u64,
    precio_centavos: Option<u64>,
    in_stock: Option<bool>,
    url: String,
    parser_version: u16,
    name: Option<String>,
    image_url: Option<String>,
}

#[tokio::main]
async fn main() {
    let mut args = args().skip(1);
    let links_list_path = args.next().unwrap();
    let links_str = fs::read_to_string(links_list_path).unwrap();
    let links = links_str
        .split("\n")
        .map(|s| s.trim())
        .filter(|s| s.len() > 0)
        .map(|s| s.to_owned())
        .collect::<Vec<_>>();

    let handle = {
        let (sender, receiver) = async_channel::bounded::<String>(1);
        let (res_sender, res_receiver) = async_channel::unbounded::<PrecioPoint>();

        let mut handles = Vec::new();
        for _ in 1..16 {
            let rx = receiver.clone();
            let tx = res_sender.clone();
            handles.push(tokio::spawn(worker(rx, tx)));
        }

        let db_writer_handle = tokio::spawn(db_writer(res_receiver));

        for link in links {
            sender.send_blocking(link).unwrap();
        }
        sender.close();

        for handle in handles {
            handle.await.unwrap();
        }

        db_writer_handle
    };
    handle.await.unwrap();
}

async fn worker(rx: Receiver<String>, tx: Sender<PrecioPoint>) {
    let client = reqwest::ClientBuilder::default().build().unwrap();
    while let Ok(url) = rx.recv().await {
        let res = fetch_and_parse(&client, url.clone()).await;
        match res {
            Ok(ex) => {
                tx.send(ex).await.unwrap();
            }
            Err(err) => {
                stderr()
                    .write_all(format!("Failed to fetch {}: {:#?}\n", url.as_str(), err).as_bytes())
                    .await
                    .unwrap();
            }
        }
    }
}

#[derive(Debug)]
enum FetchError {
    HttpError(reqwest::Error),
    NoPriceMetaEl,
    NoMetaContent,
    NotANumber,
    NoStockMetaEl,
    NoValidStockMeta,
    NoSeedState,
    NoProductInSeedState,
    NoProductSkuInSeedState,
}

async fn fetch_and_parse(client: &reqwest::Client, url: String) -> Result<PrecioPoint, FetchError> {
    let request = client.get(url.as_str()).build().unwrap();
    let response = client
        .execute(request)
        .await
        .map_err(|e| FetchError::HttpError(e))?;
    let body = response
        .text()
        .await
        .map_err(|e| FetchError::HttpError(e))?;

    let html = Html::parse_document(&body);

    let point = parse_carrefour(url, html)?;

    Ok(point)
}
fn parse_carrefour(url: String, html: Html) -> Result<PrecioPoint, FetchError> {
    let meta_price_sel = Selector::parse("meta[property=\"product:price:amount\"]").unwrap();
    let precio_centavos = match html.select(&meta_price_sel).next() {
        Some(el) => match el.attr("content") {
            Some(attr) => match attr.parse::<f64>() {
                Ok(f) => Ok((f * 100.0) as u64),
                Err(_) => Err(FetchError::NotANumber),
            },
            None => Err(FetchError::NoMetaContent),
        },
        None => Err(FetchError::NoPriceMetaEl),
    }?;

    let meta_stock_el = Selector::parse("meta[property=\"product:availability\"]").unwrap();
    let in_stock = match html.select(&meta_stock_el).next() {
        Some(el) => match el.attr("content") {
            Some(attr) => match attr {
                "oos" => Ok(Some(false)),
                "instock" => Ok(Some(true)),
                _ => Err(FetchError::NoValidStockMeta),
            },
            None => Err(FetchError::NoMetaContent),
        },
        None => Err(FetchError::NoStockMetaEl),
    }?;

    let ean = {
        let state = parse_script_json(&html, "__STATE__").ok_or(FetchError::NoSeedState)?;
        let seed_state = &state.as_object().ok_or(FetchError::NoSeedState)?;
        let (_, product_json) = seed_state
            .into_iter()
            .find(|(key, val)| {
                key.starts_with("Product:")
                    && val.as_object().map_or(false, |val| {
                        val.get("__typename")
                            .map_or(false, |typename| typename == "Product")
                    })
            })
            .ok_or(FetchError::NoProductInSeedState)?;
        let cache_id = product_json
            .get("cacheId")
            .ok_or(FetchError::NoProductInSeedState)?;
        let (_, product_sku_json) = seed_state
            .into_iter()
            .filter_map(|(key, val)| val.as_object().map_or(None, |o| Some((key, o))))
            .find(|(key, val)| {
                key.starts_with(&format!("Product:{}", cache_id))
                    && val
                        .get("__typename")
                        .map_or(false, |typename| typename == "SKU")
            })
            .ok_or(FetchError::NoProductSkuInSeedState)?;
        product_sku_json
            .get("ean")
            .ok_or(FetchError::NoProductSkuInSeedState)?
            .as_str()
            .ok_or(FetchError::NoProductSkuInSeedState)?
            .to_string()
    };

    Ok(PrecioPoint {
        ean: ean,
        fetched_at: now_sec(),
        in_stock: in_stock,
        name: None,
        image_url: None,
        parser_version: 5,
        precio_centavos: Some(precio_centavos),
        url: url,
    })
}

fn parse_script_json(html: &Html, varname: &str) -> Option<serde_json::Value> {
    let template_sel = Selector::parse(&format!(
        "template[data-type=\"json\"][data-varname=\"{}\"]",
        varname
    ))
    .unwrap();
    match html.select(&template_sel).next() {
        Some(value) => match value.first_element_child() {
            Some(script) => match serde_json::from_str(&script.inner_html()) {
                Ok(val) => val,
                Err(_) => None,
            },
            None => None,
        },
        None => None,
    }
}

fn now_sec() -> u64 {
    let start = SystemTime::now();
    let since_the_epoch = start
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards");
    since_the_epoch.as_secs()
}

async fn db_writer(rx: Receiver<PrecioPoint>) {
    let conn = Connection::open("../scraper/sqlite.db").unwrap();
    // let mut stmt = conn.prepare("SELECT id, name, data FROM person")?;
    while let Ok(res) = rx.recv().await {
        println!("{:#?}", res)
    }
}
