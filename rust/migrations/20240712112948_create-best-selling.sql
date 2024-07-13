CREATE TABLE
    db_best_selling (
        id serial PRIMARY KEY NOT NULL,
        fetched_at integer NOT NULL,
        category text NOT NULL,
        eans_json text NOT NULL
    );