FROM cgr.dev/chainguard/wolfi-base AS base
WORKDIR /usr/src/app
RUN apk add --no-cache libgcc

FROM docker.io/rust:1.76 as rs-build
# RUN apt-get update && apt-get install -y libsqlite3-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app

COPY . .
RUN --mount=type=cache,sharing=locked,target=/root/.cargo/git \
    --mount=type=cache,sharing=locked,target=/root/.cargo/registry \
    --mount=type=cache,sharing=locked,target=/usr/src/app/target \
	cargo install --locked --path .

FROM base
RUN apk add --no-cache sqlite sqlite-libs

# Scraper
COPY --from=rs-build /usr/local/cargo/bin/scraper-rs /usr/local/bin/scraper-rs

ENV DB_PATH=/db/db.db

CMD ["scraper-rs", "cron"]
