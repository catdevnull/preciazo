use std::{env::args, io::BufReader, process::Stdio, thread};

use scraper::{Html, Selector};
use warc::WarcReader;

struct Product {
    precio_centavos: u32,
}

#[derive(Debug)]
enum ParseError {
    DidntFindElement,
    DidntFindProp,
    ParseError,
}

fn parse_carrefour(document: Html) -> Result<Product, ParseError> {
    let meta_product_price = Selector::parse("meta[property=\"product:price:amount\"]").unwrap();

    let price = document
        .select(&meta_product_price)
        .next()
        .ok_or(ParseError::DidntFindElement)?
        .attr("content")
        .ok_or(ParseError::DidntFindProp)?
        .parse::<f64>()
        .map_err(|_| ParseError::ParseError)?;

    Ok(Product {
        precio_centavos: (price * 100.0) as u32,
    })
}

fn main() {
    let warcs: Vec<_> = args().skip(1).collect();
    println!("{:?}", warcs);

    let handles = warcs
        .iter()
        .map(|path| {
            let p = path.clone();
            thread::spawn(move || {
                let cmd = std::process::Command::new("zstd")
                    .arg("-d")
                    .stdin(std::fs::File::open(p).unwrap())
                    .stdout(Stdio::piped())
                    .spawn()
                    .unwrap();

                let warc = WarcReader::new(BufReader::new(cmd.stdout.unwrap()));
                for record in warc.iter_records() {
                    let r = record.unwrap();
                    match r.warc_type() {
                        warc::RecordType::Response => {
                            let raw_uri = r.header(warc::WarcHeader::TargetURI).unwrap();
                            let uri = raw_uri.trim_start_matches('<').trim_end_matches('>');
                            println!("{}", uri);
                            println!("{}", r.header(warc::WarcHeader::Date).unwrap());
                            let html = unsafe { std::str::from_utf8_unchecked(r.body()) };
                            let document = Html::parse_document(html);
                            match parse_carrefour(document) {
                                Ok(p) => println!("{}", p.precio_centavos),
                                Err(err) => println!("{} {:?}", uri, err),
                            }
                        }
                        _ => {}
                    }
                }
            })
        })
        .collect::<Vec<_>>();

    for h in handles {
        h.join().unwrap();
    }
}
