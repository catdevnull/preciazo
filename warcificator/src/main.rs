use async_channel::{Receiver, Sender};
// use lol_html::{
//     element,
//     html_content::{Element, TextChunk},
//     text, ElementContentHandlers, HtmlRewriter, Selector, Settings,
// };
use rusqlite::Connection;
use serde::de::value;
use tl::VDom;
// use scraper::{Element, Html, Selector};
use std::{
    borrow::Cow,
    env::{self, args},
    fs,
    ops::Deref,
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

// fn main() {
//     let arg = args().skip(1).next().unwrap();

//     let file_iter = fs::read_dir(arg)
//         .unwrap()
//         .filter(|pr| {
//             if let Ok(p) = pr {
//                 !p.file_name().to_str().unwrap().ends_with(".link")
//             } else {
//                 false
//             }
//         })
//         .take(1000)
//         .map(|f| fs::read(f.unwrap().path()).unwrap());

//     let mut i = 0;
//     for item in file_iter {
//         i = i + 1;
//         {
//             // let mut text: Option<String> = None;
//             // let mut price_str: Option<String> = None;
//             // let mut rewriter = HtmlRewriter::new(
//             //     Settings {
//             //         element_content_handlers: vec![
//             //             // Rewrite insecure hyperlinks
//             //             element!("a[href]", |el| {
//             //                 let href = el.get_attribute("href").unwrap().replace("http:", "https:");

//             //                 el.set_attribute("href", &href).unwrap();

//             //                 Ok(())
//             //             }),
//             //             (
//             //                 Cow::Owned("a".parse().unwrap()),
//             //                 ElementContentHandlers::default().text(extract_first_text(&mut text)),
//             //             ),
//             //             element!(
//             //                 "meta[property=\"product:price:amount\"]",
//             //                 extract_first_attr(&mut price_str, "content")
//             //             ),
//             //         ],
//             //         memory_settings: lol_html::MemorySettings {
//             //             preallocated_parsing_buffer_size: 1024 * 16,
//             //             max_allowed_memory_usage: std::usize::MAX,
//             //         },
//             //         ..Settings::default()
//             //     },
//             //     |_: &[u8]| {},
//             // );

//             // rewriter.write(&item).unwrap();
//             // rewriter.end().unwrap();
//             // println!("{:#?}", price_str);

//             // let html = scraper::Html::parse_document(&String::from_utf8(item).unwrap());

//             let html = String::from_utf8(item).unwrap();
//             let dom = tl::parse(&html, tl::ParserOptions::default()).unwrap();

//             match parse_carrefour("".into(), &dom) {
//                 Ok(point) => {
//                     // println!("{:?}", point);
//                 }
//                 Err(err) => {
//                     // println!("Error {:#?}: {}", err, html);
//                 }
//             };
//         }
//     }
//     println!("n={}", i);
// }

// fn extract_first_text(
//     output: &mut Option<String>,
// ) -> impl FnMut(
//     &mut TextChunk,
// ) -> Result<(), Box<(dyn std::error::Error + std::marker::Send + Sync + 'static)>>
//        + '_ {
//     move |el| {
//         if *output == None {
//             *output = Some(el.as_str().to_owned());
//         }
//         Ok(())
//     }
// }

// fn extract_first_attr<'a>(
//     output: &'a mut Option<String>,
//     attr: &'a str,
// ) -> impl FnMut(
//     &mut Element,
// ) -> Result<(), Box<(dyn std::error::Error + std::marker::Send + Sync + 'static)>>
//        + 'a {
//     move |el| {
//         if *output == None {
//             if let Some(value) = el.get_attribute(attr) {
//                 *output = Some(value);
//             }
//         }
//         Ok(())
//     }
// }

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
        for _ in 1..env::var("N_COROUTINES")
            .map_or(Ok(32), |s| s.parse::<usize>())
            .unwrap()
        {
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
    ParseError(&'static str),
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

    let dom = tl::parse(&body, tl::ParserOptions::default()).unwrap();
    // let parser = dom.parser();

    let point = parse_carrefour(url, &dom)?;

    Ok(point)
}

fn parse_carrefour(url: String, dom: &tl::VDom) -> Result<PrecioPoint, FetchError> {
    let precio_centavos = {
        get_meta_content(dom, "product:price:amount")?
            .map(|s| {
                s.parse::<f64>()
                    .map_err(|_| FetchError::ParseError("Failed to parse number"))
            })
            .transpose()
            .map(|f| f.map(|f| (f * 100.0) as u64))
    }?;

    let in_stock_meta = get_meta_content(dom, "product:availability")?.map(|s| s.into_owned());
    let in_stock = match in_stock_meta {
        Some(s) => match s.as_ref() {
            "oos" => Some(false),
            "instock" => Some(true),
            _ => return Err(FetchError::ParseError("Not a valid product:availability")),
        },
        None => None,
    };

    let ean = {
        let json = &parse_script_json(dom, "__STATE__")?;
        let state = json
            .as_object()
            .ok_or(FetchError::ParseError("Seed state not an object"))?;
        let (_, product_json) = state
            .into_iter()
            .find(|(key, val)| {
                key.starts_with("Product:")
                    && val
                        .as_object()
                        .and_then(|val| val.get("__typename"))
                        .map_or(false, |typename| typename == "Product")
            })
            .ok_or(FetchError::ParseError("No product in seed state"))?;
        let cache_id = product_json
            .get("cacheId")
            .and_then(|v| v.as_str())
            .ok_or(FetchError::ParseError("No cacheId in seed state"))?;
        let (_, product_sku_json) = state
            .iter()
            .find(|(key, val)| {
                key.starts_with(&format!("Product:{}", cache_id))
                    && val.as_object().map_or(false, |obj| {
                        obj.get("__typename")
                            .map_or(false, |typename| typename == "SKU")
                    })
            })
            .ok_or(FetchError::ParseError("No Product:cacheId* found"))?;
        product_sku_json
            .get("ean")
            .and_then(|v| v.as_str())
            .ok_or(FetchError::ParseError("No product SKU in seed state"))?
            .to_string()
    };

    Ok(PrecioPoint {
        ean: ean,
        fetched_at: now_sec(),
        in_stock: in_stock,
        name: None,
        image_url: None,
        parser_version: 5,
        precio_centavos: precio_centavos,
        url: url,
    })
}

fn get_meta_content<'a>(dom: &'a VDom<'a>, prop: &str) -> Result<Option<Cow<'a, str>>, FetchError> {
    let tag = &dom
        .query_selector(&format!("meta[property=\"{}\"]", prop))
        .and_then(|mut iter| iter.next())
        .and_then(|h| h.get(dom.parser()))
        .and_then(|n| n.as_tag());
    match tag {
        Some(tag) => Ok(Some(
            tag.attributes()
                .get("content")
                .flatten()
                .ok_or(FetchError::ParseError("Failed to get content attr"))?
                .as_utf8_str(),
        )),
        None => Ok(None),
    }
}

fn parse_script_json(dom: &VDom, varname: &str) -> Result<serde_json::Value, FetchError> {
    let parser = dom.parser();
    let inner_html = &dom
        .query_selector(&format!(
            "template[data-type=\"json\"][data-varname=\"{}\"]",
            varname
        ))
        .and_then(|mut iter| iter.next())
        .and_then(|h| h.get(parser))
        .and_then(|n| n.as_tag())
        .and_then(|t| {
            t.children()
                .all(parser)
                .iter()
                .find(|n| n.as_tag().is_some())
        })
        .ok_or(FetchError::ParseError("Failed to get script tag"))?
        .inner_html(parser);
    Ok(inner_html
        .parse()
        .map_err(|_| FetchError::ParseError("Couldn't parse JSON in script"))?)
}

// fn parse_script_json(html: &Html, varname: &str) -> Option<serde_json::Value> {
//     let template_sel = Selector::parse(&format!(
//         "template[data-type=\"json\"][data-varname=\"{}\"]",
//         varname
//     ))
//     .unwrap();
//     match html.select(&template_sel).next() {
//         Some(value) => match value.first_element_child() {
//             Some(script) => match serde_json::from_str(&script.inner_html()) {
//                 Ok(val) => val,
//                 Err(_) => None,
//             },
//             None => None,
//         },
//         None => None,
//     }
// }

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
        println!("{:?}", res)
    }
}
