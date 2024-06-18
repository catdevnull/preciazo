FROM docker.io/node:20 AS base
WORKDIR /usr/src/app

FROM base as build
RUN npm install --global pnpm
COPY db-datos/package.json db-datos/package.json
COPY sitio/package.json sitio/package.json
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN cd sitio && pnpm install
COPY . .
COPY db-datos/drizzle .
RUN cd sitio && \
    pnpm install && \
    pnpm build

FROM base
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y jq sqlite3 && apt-get clean

# Sitio
COPY --from=build /usr/src/app/sitio/package.json package.real.json
RUN sh -c 'echo {\"name\":\"sitio\",\"type\":\"module\",\"dependencies\":$(jq .dependencies < package.real.json)} > package.json' && npm install
COPY --from=build /usr/src/app/db-datos node_modules/db-datos
COPY --from=build /usr/src/app/sitio/build .
COPY --from=build /usr/src/app/db-datos/drizzle drizzle

ENV DB_PATH=/db/db.db
EXPOSE 3000

CMD ["node", "."]
