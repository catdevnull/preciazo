use async_channel::{Receiver, Sender};
use std::{env::args, fs, io::stdout, net::SocketAddr};
use tokio::io::{stderr, AsyncWriteExt};
use warc::{RecordBuilder, WarcHeader, WarcWriter};

struct FullExchange {
    socket_addr: Option<SocketAddr>,
    request: http::Request<&'static str>,
    response: http::Response<Vec<u8>>,
}

#[tokio::main]
async fn main() {
    let links_list_path = args().skip(1).next().unwrap();
    let links_str = fs::read_to_string(links_list_path).unwrap();
    let links = links_str
        .split("\n")
        .map(|s| s.trim())
        .filter(|s| s.len() > 0)
        .map(|s| s.to_owned())
        .collect::<Vec<_>>();

    let handle = {
        let (sender, receiver) = async_channel::bounded::<String>(1);
        let (res_sender, res_receiver) = async_channel::unbounded::<FullExchange>();

        let mut handles = Vec::new();
        for _ in 1..16 {
            let rx = receiver.clone();
            let tx = res_sender.clone();
            handles.push(tokio::spawn(worker(rx, tx)));
        }

        let warc_writer_handle = tokio::spawn(warc_writer(res_receiver));

        for link in links {
            sender.send_blocking(link).unwrap();
        }
        sender.close();

        for handle in handles {
            handle.await.unwrap();
        }

        warc_writer_handle
    };
    handle.await.unwrap();
}

async fn worker(rx: Receiver<String>, tx: Sender<FullExchange>) {
    let client = reqwest::ClientBuilder::default().build().unwrap();
    while let Ok(url) = rx.recv().await {
        let res = fetch(&client, url.clone()).await;
        match res {
            Ok(ex) => {
                tx.send(ex).await.unwrap();
            }
            Err(err) => {
                stderr()
                    .write_all(format!("Failed to fetch {}: {:#?}", url.as_str(), err).as_bytes())
                    .await
                    .unwrap();
            }
        }
    }
}

async fn fetch(client: &reqwest::Client, url: String) -> Result<FullExchange, reqwest::Error> {
    let request = client.get(url).build().unwrap();
    let mut http_request_builder = http::Request::builder()
        .method(request.method())
        .uri(request.url().as_str());
    for (key, val) in request.headers() {
        http_request_builder = http_request_builder.header(key, val);
    }
    let response = client.execute(request).await?;

    let ip_address = response.remote_addr();

    let http_request = {
        http_request_builder
            .version(response.version())
            .body("")
            .unwrap()
    };

    let http_response = {
        let mut http_response_builder = http::Response::<()>::builder()
            .status(response.status())
            .version(response.version());
        for (key, val) in response.headers() {
            http_response_builder = http_response_builder.header(key, val);
        }
        let body = response.bytes().await?;
        http_response_builder.body(body.to_vec()).unwrap()
    };

    Ok(FullExchange {
        socket_addr: ip_address,
        request: http_request,
        response: http_response,
    })
}

async fn warc_writer(rx: Receiver<FullExchange>) {
    let mut writer = WarcWriter::new(stdout());
    writer
        .write(
            &RecordBuilder::default()
                .version("1.0".to_owned())
                .warc_type(warc::RecordType::WarcInfo)
                .header(WarcHeader::ContentType, "application/warc-fields")
                .body(format!("software: preciazo-warcificator/0.0.0\nformat: WARC file version 1.0\nconformsTo: http://www.archive.org/documents/WarcFileFormat-1.0.html").into())
                .build()
                .unwrap(),
        )
        .unwrap();
    while let Ok(res) = rx.recv().await {
        let uri = res.request.uri().to_string();
        let req_record = {
            let mut builder = RecordBuilder::default()
                .version("1.0".to_owned())
                .warc_type(warc::RecordType::Request)
                .header(WarcHeader::TargetURI, uri.clone())
                .header(WarcHeader::ContentType, "application/http;msgtype=request")
                .header(
                    WarcHeader::Unknown("X-Warcificator-Lying".to_string()),
                    "the request contains other headers not included here",
                );
            if let Some(addr) = res.socket_addr {
                builder = builder.header(WarcHeader::IPAddress, addr.ip().to_string());
            }
            builder
                .body(format_http11_request(res.request).into_bytes())
                .build()
                .unwrap()
        };
        writer.write(&req_record).unwrap();
        writer
            .write(&{
                let mut builder = RecordBuilder::default()
                    .version("1.0".to_owned())
                    .warc_type(warc::RecordType::Response)
                    .header(WarcHeader::TargetURI, uri)
                    .header(WarcHeader::ConcurrentTo, req_record.warc_id())
                    .header(WarcHeader::ContentType, "application/http;msgtype=response");
                if let Some(addr) = res.socket_addr {
                    builder = builder.header(WarcHeader::IPAddress, addr.ip().to_string());
                }
                builder
                    .body(format_http11_response(res.response))
                    .build()
                    .unwrap()
            })
            .unwrap();
    }
}

fn format_http11_request(req: http::Request<&'static str>) -> String {
    let start_line = format!("{} {} HTTP/1.1", req.method().as_str(), req.uri().path());
    let headers_str = req
        .headers()
        .iter()
        .map(|(key, val)| format!("{}: {}\r\n", key, val.to_str().unwrap()))
        .collect::<String>();

    [start_line.as_str(), headers_str.as_str(), req.body()].join("\r\n")
}

fn format_http11_response(res: http::Response<Vec<u8>>) -> Vec<u8> {
    let start_line = format!(
        "HTTP/1.1 {} {}",
        res.status().as_str(),
        res.status().canonical_reason().unwrap_or("")
    );
    let headers_str = res
        .headers()
        .iter()
        .map(|(key, val)| format!("{}: {}\r\n", key, val.to_str().unwrap()))
        .collect::<String>();

    let crlf: &[u8] = &[13, 10];
    [start_line.as_bytes(), headers_str.as_bytes(), res.body()].join(crlf)
}
