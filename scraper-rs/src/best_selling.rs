use std::collections::HashMap;

use crate::{build_client, sites::vtex, supermercado::Supermercado};
use chrono::{DateTime, Utc};
use clap::ValueEnum;
use deadpool_sqlite::Pool;
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use itertools::Itertools;
use tracing::warn;

#[derive(ValueEnum, Clone, Debug)]
pub enum Category {
    Almacen,
    Bebidas,
    FrutasYVerduras,
}
impl Category {
    fn query(&self, supermercado: &Supermercado) -> Option<&'static str> {
        match self {
            Self::Almacen => match supermercado {
                Supermercado::Jumbo | Supermercado::Dia => Some("almacen"),
                _ => None,
            },
            Self::Bebidas => match supermercado {
                Supermercado::Jumbo | Supermercado::Dia => Some("bebidas"),
                _ => None,
            },
            Self::FrutasYVerduras => match supermercado {
                Supermercado::Jumbo => Some("frutas-y-verduras"),
                Supermercado::Dia => Some("frescos/frutas-y-verduras"),
                _ => None,
            },
        }
    }

    pub fn id(&self) -> &'static str {
        match self {
            Self::Almacen => "almacen",
            Self::Bebidas => "bebidas",
            Self::FrutasYVerduras => "frutas-y-verduras",
        }
    }
}

#[derive(Debug)]
pub struct BestSellingRecord {
    pub fetched_at: DateTime<Utc>,
    pub category: Category,
    pub eans: Vec<String>,
}

async fn get_best_selling_eans(pool: &Pool, urls: Vec<String>) -> anyhow::Result<Vec<String>> {
    let mut eans: Vec<String> = Vec::new();

    for url in urls {
        let q = url.clone();
        let ean = pool
            .get()
            .await?
            .interact(move |conn| {
                conn.prepare(r#"SELECT ean FROM precios WHERE url = ?1;"#)?
                    .query_map(rusqlite::params![q], |r| r.get::<_, String>(0))
                    .map(|r| r.map(|r| r.unwrap()).next())
            })
            .await
            .unwrap()?;
        match ean {
            Some(e) => eans.push(e),
            None => warn!("No encontré EAN para {}", url),
        }
    }

    Ok(eans)
}

async fn try_get_best_selling_eans(
    client: reqwest::Client,
    pool: Pool,
    supermercado: &Supermercado,
    category: &Category,
) -> anyhow::Result<Option<Vec<String>>> {
    if let Some(query) = category.query(supermercado) {
        let urls = vtex::get_best_selling_by_category(&client, supermercado.host(), query).await?;
        let eans = get_best_selling_eans(&pool, urls).await?;
        Ok(Some(eans))
    } else {
        Ok(None)
    }
}

async fn noop<T>(t: T) -> anyhow::Result<T> {
    Ok(t)
}

fn rank_eans(eans: Vec<Vec<String>>) -> Vec<String> {
    let mut map: HashMap<String, usize> = HashMap::new();
    for eans in eans {
        for (i, ean) in eans.into_iter().enumerate() {
            let base = map.get(&ean).unwrap_or(&0);
            let score = base + 1000 / (i + 1);
            map.insert(ean, score);
        }
    }
    map.into_iter()
        .sorted_by(|a, b| Ord::cmp(&b.1, &a.1))
        .map(|t| t.0)
        .collect_vec()
}

pub async fn get_all_best_selling(pool: &Pool) -> anyhow::Result<Vec<BestSellingRecord>> {
    let client = &build_client();

    stream::iter(Category::value_variants())
        .map(|category| {
            stream::iter(Supermercado::value_variants())
                .map(|supermercado| {
                    let pool = pool.clone();
                    let client = client.clone();
                    tokio::spawn(try_get_best_selling_eans(
                        client,
                        pool,
                        supermercado,
                        category,
                    ))
                })
                .buffer_unordered(5)
                .map(|f| f.unwrap())
                .try_filter_map(noop)
                .try_collect::<Vec<Vec<String>>>()
                .map(|r| {
                    r.map(rank_eans).map(|eans| BestSellingRecord {
                        fetched_at: Utc::now(),
                        category: category.clone(),
                        eans,
                    })
                })
        })
        .buffer_unordered(5)
        .boxed()
        .try_collect()
        .await
}
