FROM cgr.dev/chainguard/wolfi-base AS base
WORKDIR /usr/src/app
RUN apk add --no-cache libgcc

FROM docker.io/rust:1 AS rs-build
# RUN apt-get update && apt-get install -y libsqlite3-dev sqlite3 && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app

COPY . .
RUN --mount=type=cache,sharing=locked,target=/root/.cargo/git \
    --mount=type=cache,sharing=locked,target=/root/.cargo/registry \
    --mount=type=cache,sharing=locked,target=/usr/src/app/target \
    SQLX_OFFLINE=true cargo install --bin api --locked --path .

FROM base
RUN apk add --no-cache sqlite sqlite-libs tini
ENTRYPOINT ["tini", "--"]

# api
COPY --from=rs-build /usr/local/cargo/bin/api /usr/local/bin/api

ENV DB_PATH=/db/db.db

EXPOSE 8000
CMD ["api"]
