use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Router};
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
struct CategoryWithProducts {}

async fn get_best_selling(State(pool): State<SqlitePool>) -> impl IntoResponse {
    let categories = sqlx::query!(
        "SELECT fetched_at, category, eans_json FROM db_best_selling
        GROUP BY category
        HAVING MAX(fetched_at)",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    categories.iter().map(|category| {
        let eans =
            serde_json::de::from_str::<Vec<String>>(&category.eans_json.clone().unwrap()).unwrap();
        let products = sqlx::query!(
            "SELECT ean, name, image_url FROM precios
        WHERE ean in (?)
        GROUP BY ean
        HAVING MAX(fetched_at)",
            eans,
        )
        .fetch_all(&pool)
        .await
        .unwrap();
    });

    todo!()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::from_str(&format!(
                "sqlite://{}",
                env::var("DB_PATH").unwrap_or("../sqlite.db".to_string())
            ))
            .unwrap()
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(15))
            .optimize_on_close(true, None),
        )
        .await
        .expect("can't connect to database");

    let app = Router::new()
        .route("/", get(index))
        .route("/api/healthcheck", get(healthcheck))
        .route("/api/0/best-selling-products", get(get_best_selling))
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
    tracing::info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}
