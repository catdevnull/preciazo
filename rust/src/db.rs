use std::env;

use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn connect_db() -> anyhow::Result<PgPool> {
    dotenvy::dotenv()?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("DATABASE_URL")?)
        .await?;
    sqlx::migrate!("./migrations/").run(&pool).await?;
    Ok(pool)

    // let pool = SqlitePoolOptions::new()
    //     .max_connections(1)
    //     .connect_with(
    //         SqliteConnectOptions::from_str(&format!(
    //             "sqlite://{}",
    //             env::var("DB_PATH").unwrap_or("../sqlite.db".to_string())
    //         ))
    //         .unwrap()
    //         .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
    //         .pragma("journal_size_limit", "67108864")
    //         .pragma("mmap_size", "134217728")
    //         .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
    //         .busy_timeout(Duration::from_secs(15))
    //         .pragma("cache_size", "2000")
    //         .optimize_on_close(true, None),
    //     )
    //     .await
    //     .expect("can't connect to database");
}
