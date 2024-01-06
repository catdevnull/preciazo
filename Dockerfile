FROM docker.io/oven/bun:1-alpine AS base
WORKDIR /usr/src/app

FROM base as build
ENV NODE_ENV=production
RUN apk add --no-cache nodejs
COPY . .
RUN bun install --frozen-lockfile
RUN cd sitio && \
    bun run build
RUN bun build scraper/cli.ts --target=bun --outfile=/tmp/cli.build.js

FROM base
ARG S6_OVERLAY_VERSION=3.1.6.2
RUN apk add --no-cache nodejs npm jq

ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz

# Cron scraper
RUN printf "#!/bin/sh\nexec bun /bin/scraper auto\n" > /etc/periodic/daily/scraper \
    && chmod +x /etc/periodic/daily/scraper

# Sitio
COPY --from=build /usr/src/app/sitio/package.json package.real.json
RUN sh -c 'echo {\"name\":\"sitio\",\"type\":\"module\",\"dependencies\":$(jq .dependencies < package.real.json)} > package.json' && npm install
COPY --from=build /usr/src/app/db-datos node_modules/db-datos
COPY --from=build /usr/src/app/sitio/build .

# Scraper
COPY --from=build /tmp/cli.build.js /bin/scraper
COPY --from=build /usr/src/app/db-datos/drizzle /bin/drizzle

ENV NODE_ENV=production
ENV DB_PATH=/db/db.db
EXPOSE 3000

# Servicios
RUN mkdir -p /etc/services.d/sitio /etc/services.d/scraper && \
    printf "#!/command/execlineb -P\nnode /usr/src/app\n" > /etc/services.d/sitio/run && \
    chmod +x /etc/services.d/sitio/run && \
    printf "#!/command/execlineb -P\nbusybox crond -f -l2\n" > /etc/services.d/scraper/run && \
    chmod +x /etc/services.d/scraper/run

ENTRYPOINT ["/init"]