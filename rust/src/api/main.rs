use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use clap::ValueEnum;
use futures::future::join_all;
use itertools::Itertools;
use preciazo::supermercado::Supermercado;
use serde::Serialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::{env, str::FromStr, time::Duration};

async fn index() -> &'static str {
    "Hello, world! <a href=https://github.com/catdevnull/preciazo>catdevnull/preciazo</a>"
}
async fn healthcheck(State(pool): State<SqlitePool>) -> impl IntoResponse {
    let one_day_ago = chrono::Utc::now() - chrono::Duration::hours(25);
    let timestamp = one_day_ago.timestamp();

    let supermercados_checks =
        join_all(Supermercado::value_variants().iter().map(|supermercado| {
            let value = pool.clone();
            async move {
                let url_query = format!("%{}%", supermercado.host());
                let count = sqlx::query!(
                    "SELECT count(id) as count FROM precios
                    WHERE fetched_at > ?
                        AND url LIKE ?",
                    timestamp,
                    url_query
                )
                .fetch_one(&value)
                .await
                .unwrap()
                .count;
                let expected_count = match *supermercado {
                    Supermercado::Carrefour => 45000,
                    Supermercado::Coto => 28000,
                    Supermercado::Jumbo => 18000,
                    Supermercado::Farmacity => 8000,
                    Supermercado::Dia => 4000,
                };
                if count < expected_count {
                    Err(format!(
                        "[{:?}] last 25h: expected at least {}, got {}",
                        supermercado, expected_count, count
                    ))
                } else {
                    Ok(format!("[{:?}] last 25h: {} precios", supermercado, count))
                }
            }
        }))
        .await
        .into_iter()
        .collect_vec();

    let best_selling_check = {
        let record = sqlx::query!(
            "SELECT count(id) as count FROM db_best_selling
                    WHERE fetched_at > ?",
            timestamp,
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let count = record.count;
        let expected_count = 3;
        if count < expected_count {
            Err(format!(
                "[best_selling] last 25h: expected at least {}, got {}",
                expected_count, count
            ))
        } else {
            Ok(format!("[best_selling] last 25h: {}", count))
        }
    };

    let list = format!(
        "{}\n- {:?}",
        supermercados_checks
            .clone()
            .into_iter()
            .map(|c| format!("- {:?}", c))
            .join("\n"),
        best_selling_check
    );

    if supermercados_checks.into_iter().all(|r| r.is_ok()) && best_selling_check.is_ok() {
        (StatusCode::OK, format!("all is ok\n{}", list))
    } else {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("errors:\n{}", list),
        )
    }
}

#[derive(Serialize)]
struct CategoryWithProducts {
    category: String,
    products: Vec<Product>,
}

#[derive(Serialize)]
struct Product {
    ean: String,
    name: Option<String>,
    image_url: Option<String>,
}

async fn get_best_selling(State(pool): State<SqlitePool>) -> impl IntoResponse {
    #[derive(sqlx::FromRow, Debug)]
    struct ProductWithCategory {
        category: String,
        ean: String,
        name: Option<String>,
        image_url: Option<String>,
    }

    let products_with_category = sqlx::query_as::<_, ProductWithCategory>(
        "with latest_best_selling as (
            select category, eans_json
            from db_best_selling
            group by category
            having max(fetched_at)
        ),
        extracted_eans as (
            select latest_best_selling.category, json.value as ean
            from latest_best_selling, json_each(latest_best_selling.eans_json) json
        )
        select extracted_eans.category, extracted_eans.ean, precios.image_url, name
        from extracted_eans
        join precios
        on extracted_eans.ean = precios.ean
        where
            precios.fetched_at = (
                SELECT MAX(fetched_at)
                FROM precios
                WHERE ean = extracted_eans.ean
            )",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let categories = products_with_category
        .iter()
        .map(|p| p.category.clone())
        .unique()
        .collect_vec();

    let categories_with_products = categories
        .into_iter()
        .map(|c| CategoryWithProducts {
            category: c.clone(),
            products: products_with_category
                .iter()
                .filter(|p| p.category == c)
                .map(|p| Product {
                    ean: p.ean.clone(),
                    image_url: p.image_url.clone(),
                    name: p.name.clone(),
                })
                .collect_vec(),
        })
        .collect_vec();

    Json(categories_with_products)
}

async fn get_product_history(
    State(pool): State<SqlitePool>,
    Path(ean): Path<String>,
) -> impl IntoResponse {
    #[derive(sqlx::FromRow, Debug, Serialize)]
    struct Precio {
        ean: String,
        fetched_at: chrono::DateTime<Utc>,
        precio_centavos: Option<i64>,
        in_stock: Option<bool>,
        url: String,
        name: Option<String>,
        image_url: Option<String>,
    }

    let precios = sqlx::query!(
        "
select ean,fetched_at,precio_centavos,in_stock,url,name,image_url from precios
where ean = ?
order by fetched_at
",
        ean
    )
    .map(|r| Precio {
        ean: r.ean,
        url: r.url,
        fetched_at: DateTime::from_timestamp(r.fetched_at, 0).unwrap(),
        image_url: r.image_url,
        name: r.name,
        in_stock: r.in_stock.map(|x| x == 1),
        precio_centavos: r.precio_centavos,
    })
    .fetch_all(&pool)
    .await
    .unwrap();

    Json(precios)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(
            SqliteConnectOptions::from_str(&format!(
                "sqlite://{}",
                env::var("DB_PATH").unwrap_or("../sqlite.db".to_string())
            ))
            .unwrap()
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
            .busy_timeout(Duration::from_secs(30))
            .optimize_on_close(true, None),
        )
        .await
        .expect("can't connect to database");

    sqlx::query("pragma temp_store = memory;")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("pragma mmap_size = 30000000000;")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("pragma page_size = 4096;")
        .execute(&pool)
        .await
        .unwrap();

    let app = Router::new()
        .route("/", get(index))
        .route("/api/healthcheck", get(healthcheck))
        .route("/api/0/best-selling-products", get(get_best_selling))
        .route("/api/0/ean/:ean/history", get(get_product_history))
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
    tracing::info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}
