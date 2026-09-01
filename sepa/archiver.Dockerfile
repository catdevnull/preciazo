FROM oven/bun:1.2.22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    tar \
    unzip \
    zstd \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
COPY sitio2/package.json sitio2/package.json
RUN bun install --filter sepa --frozen-lockfile --production --linker=isolated

COPY archiver.ts retry.ts ./
COPY ckan ckan
COPY index-gen index-gen
COPY archiver-runner.sh ./

RUN chmod +x /app/archiver-runner.sh \
  && chown -R bun:bun /app

USER bun

ENTRYPOINT ["/app/archiver-runner.sh"]
