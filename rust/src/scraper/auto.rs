use std::env;

use super::now_sec;
use super::AutoArgs;
use super::AutoTelegram;
use crate::best_selling;
use crate::db::Db;
use crate::scraper::Scraper;
use futures::Future;
use preciazo::supermercado::Supermercado;
use rand::seq::SliceRandom;
use rand::thread_rng;
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
            let mut links = self
                .db
                .get_recent_urls_by_domain(supermercado.host())
                .await?;
            if let Some(n) = self.args.n_products {
                links.truncate(n);
            }
            links.shuffle(&mut thread_rng());
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

            let n_coroutines = if supermercado == Supermercado::Coto {
                10
            } else {
                env::var("N_COROUTINES")
                    .map_or(Ok(24), |s| s.parse::<usize>())
                    .expect("N_COROUTINES no es un número")
            };

            let counters = self.scraper.fetch_list(&self.db, links, n_coroutines).await;
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

    pub async fn download_best_selling(&self) -> anyhow::Result<()> {
        // let best_selling: Vec<best_selling::BestSellingRecord> =

        match self
            .inform_time(
                "Downloaded best selling",
                best_selling::get_all_best_selling(&self.db),
            )
            .await
        {
            Ok(best_selling) => {
                self.db.save_best_selling(best_selling).await?;
            }
            Err(err) => {
                self.inform(&format!("FAILED best selling: {:?}", err))
                    .await
            }
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
