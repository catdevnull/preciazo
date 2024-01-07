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

FROM docker.io/oven/bun:1-slim
RUN apt-get update && apt-get install -y nodejs npm jq

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

CMD ["node", "."]