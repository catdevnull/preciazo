use std::{
    env,
    str::FromStr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use tracing::info;

use crate::{best_selling::BestSellingRecord, PrecioPoint};

#[derive(Clone)]
pub struct Db {
    pool: SqlitePool,
}

impl Db {
    pub async fn connect() -> anyhow::Result<Self> {
        let db_path = env::var("DB_PATH").unwrap_or("../sqlite.db".to_string());
        info!("Opening DB at {}", db_path);
        let pool = sqlx::pool::PoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path))?
                    // https://fractaledmind.github.io/2023/09/07/enhancing-rails-sqlite-fine-tuning/
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                    .pragma("journal_size_limit", "67108864")
                    .pragma("mmap_size", "134217728")
                    .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
                    .busy_timeout(Duration::from_secs(15))
                    .pragma("cache_size", "2000")
                    .pragma("temp_store", "memory")
                    .optimize_on_close(true, None),
            )
            .await?;
        Ok(Self { pool })
    }

    pub async fn insert_precio(&self, point: PrecioPoint) -> anyhow::Result<()> {
        sqlx::query!("INSERT INTO precios(ean, fetched_at, precio_centavos, in_stock, url, warc_record_id, parser_version, name, image_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);",
            point.ean,
            point.fetched_at,
            point.precio_centavos,
            point.in_stock,
            point.url,
            None::<String>,
            point.parser_version,
            point.name,
            point.image_url,
        ).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn get_ean_by_url(&self, url: &str) -> anyhow::Result<Option<String>> {
        Ok(sqlx::query!("SELECT ean FROM precios WHERE url = ?1;", url)
            .fetch_optional(&self.pool)
            .await?
            .map(|r| r.ean))
    }

    pub async fn get_urls_by_domain(&self, domain: &str) -> anyhow::Result<Vec<String>> {
        let query = format!("%{}%", domain);
        Ok(
            sqlx::query!("SELECT url FROM producto_urls WHERE url LIKE ?1;", query)
                .fetch_all(&self.pool)
                .await?
                .into_iter()
                .map(|r| r.url)
                .collect(),
        )
    }

    pub async fn save_producto_urls(&self, urls: Vec<String>) -> anyhow::Result<()> {
        let now: i64 = now_ms().try_into()?;
        let mut tx = self.pool.begin().await?;
        for url in urls {
            sqlx::query!(
                r#"INSERT INTO producto_urls(url, first_seen, last_seen)
                    VALUES (?1, ?2, ?2)
                    ON CONFLICT(url) DO UPDATE SET last_seen=?2;"#,
                url,
                now
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn save_best_selling(&self, records: Vec<BestSellingRecord>) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        for record in records {
            let fetched_at = record.fetched_at.timestamp_millis();
            let category = record.category.id();
            let eans_json = serde_json::Value::from(record.eans).to_string();
            sqlx::query!(
                r#"INSERT INTO db_best_selling(fetched_at, category, eans_json)
                    VALUES (?1, ?2, ?3);"#,
                fetched_at,
                category,
                eans_json
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis()
}
