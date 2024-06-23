use super::fetch_list;
use super::now_sec;
use super::supermercado::Supermercado;
use super::AutoArgs;
use super::AutoTelegram;
use crate::db::Db;
use crate::scraper::Scraper;
use futures::Future;
use reqwest::Url;

#[derive(Clone)]
pub struct Auto {
    pub db: Db,
    pub telegram: Option<AutoTelegram>,
    pub args: AutoArgs,
    pub scraper: Scraper,
}

impl Auto {
    pub async fn download_supermercado(self, supermercado: Supermercado) -> anyhow::Result<()> {
        {
            let t0 = now_sec();
            match self.get_and_save_urls(&supermercado).await {
                Ok(_) => {
                    self.inform(&format!(
                        "Downloaded url list {:?} (took {})",
                        &supermercado,
                        now_sec() - t0
                    ))
                    .await
                }
                Err(err) => {
                    self.inform(&format!(
                        "[{:?}] FAILED url list: {:?} (took {})",
                        &supermercado,
                        err,
                        now_sec() - t0
                    ))
                    .await
                }
            }
        }
        let links: Vec<String> = {
            let mut links = self.db.get_urls_by_domain(supermercado.host()).await?;
            if let Some(n) = self.args.n_products {
                links.truncate(n);
            }
            links
        };
        // {
        //     let debug_path = PathBuf::from("debug/");
        //     tokio::fs::create_dir_all(&debug_path).await.unwrap();
        //     let file_path = debug_path.join(format!("{}.txt", nanoid!()));
        //     tokio::fs::write(&file_path, &links.join("\n"))
        //         .await
        //         .unwrap();
        //     tracing::info!("Lista de {:?}: {:?}", &supermercado, file_path.display());
        // }
        {
            let t0 = now_sec();
            let counters = fetch_list(&self.db, links).await;
            self.inform(&format!(
                "Downloaded {:?}: {:?} (took {})",
                &supermercado,
                counters,
                now_sec() - t0
            ))
            .await;
        }

        Ok(())
    }

    pub async fn inform_time<T: Future<Output = R>, R>(&self, msg: &str, action: T) -> R {
        let t0 = now_sec();
        let res = action.await;
        self.inform(&format!("{} (took {})", msg, now_sec() - t0))
            .await;
        res
    }

    pub async fn get_and_save_urls(&self, supermercado: &Supermercado) -> anyhow::Result<()> {
        let urls = self.scraper.get_urls_for_supermercado(supermercado).await?;
        self.db.save_producto_urls(urls).await?;
        Ok(())
    }

    pub async fn inform(&self, msg: &str) {
        tracing::info!("{}", msg);
        if let Some(telegram) = &self.telegram {
            let u = Url::parse_with_params(
                &format!("https://api.telegram.org/bot{}/sendMessage", telegram.token),
                &[
                    ("chat_id", telegram.chat_id.clone()),
                    ("text", msg.to_string()),
                ],
            )
            .unwrap();
            reqwest::get(u).await.unwrap();
        }
    }
}
