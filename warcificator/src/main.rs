use async_channel::{Receiver, Sender};
use std::{env::args, fs, io::stdout, net::SocketAddr};
use warc::{RecordBuilder, WarcHeader, WarcWriter};

struct FullExchange {
    ip_address: SocketAddr,
    request: http::Request<&'static str>,
    response: http::Response<String>,
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
        let request = client.get(url).build().unwrap();
        let mut http_request_builder = http::Request::builder()
            .method(request.method())
            .uri(request.url().as_str());
        for (key, val) in request.headers() {
            http_request_builder = http_request_builder.header(key, val);
        }
        let response = client.execute(request).await.unwrap();

        let ip_address = response.remote_addr().unwrap();

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
            let body = response.text().await.unwrap();
            http_response_builder.body(body).unwrap()
        };

        tx.send(FullExchange {
            ip_address: ip_address,
            request: http_request,
            response: http_response,
        })
        .await;
    }
}

async fn warc_writer(rx: Receiver<FullExchange>) {
    let mut writer = WarcWriter::new(stdout());
    let warc_fields = format!("software: preciazo-warcificator/0.0.0\nformat: WARC file version 1.0\nconformsTo: http://www.archive.org/documents/WarcFileFormat-1.0.html");
    writer
        .write(
            &RecordBuilder::default()
                .version("1.0".to_owned())
                .warc_type(warc::RecordType::WarcInfo)
                .header(WarcHeader::ContentType, "application/warc-fields")
                .body(warc_fields.into())
                .build()
                .unwrap(),
        )
        .unwrap();
    while let Ok(res) = rx.recv().await {
        writer
            .write(
                &RecordBuilder::default()
                    .version("1.0".to_owned())
                    .warc_type(warc::RecordType::Request)
                    .header(WarcHeader::TargetURI, res.request.uri().to_string())
                .header(WarcHeader::IPAddress, res.ip_address.to_string())
            .header(WarcHeader::ContentType, "application/http;msgtype=request")
                    .body(warc_fields.into())
                    .build()
                    .unwrap(),
            )
            .unwrap();
    }
}

fn format_http11_request(req: http::Request<&'static str>) -> String {
    let headers_str=req.headers().iter().map(|(key,val)| format!("{}: {}\n",key,val.to_str().unwrap())).collect::<String>();

    format!(r#"{} {} HTTP/1.1
{}"#, req.method().as_str(), req.uri().path(), headers_str)
}