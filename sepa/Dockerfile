# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.1 as base

WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
# FROM base AS install

# RUN mkdir -p /temp/dev
# COPY package.json bun.lockb /temp/dev/
# COPY sitio2/package.json /temp/dev/sitio2/
# RUN cd /temp/dev/sitio2 && bun install --frozen-lockfile

# # install with --production (exclude devDependencies)
# RUN mkdir -p /temp/prod
# COPY package.json bun.lockb /temp/prod/
# COPY sitio2/package.json /temp/prod/sitio2/
# RUN cd /temp/prod/sitio2 && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
# COPY --from=install /temp/dev/node_modules node_modules
COPY . .
COPY db/schema.ts sitio2/src/lib/server/db/schema.ts
RUN cd sitio2 && bun install --frozen-lockfile

ARG DATABASE_URL

# [optional] tests & build
ENV NODE_ENV=production
ENV DATABASE_URL=$DATABASE_URL

# RUN bun test
RUN cd sitio2 && env DATABASE_URL="postgres://user:password@host:5432/db-name" bun run build

# copy production dependencies and source code into final image
FROM base AS release
# COPY --from=prerelease /usr/src/app/node_modules node_modules
COPY --from=prerelease /usr/src/app/sitio2/build .
# COPY sitio2/build .
RUN bun install --frozen-lockfile

ARG DATABASE_URL
ARG PORT=3000

ENV DATABASE_URL=$DATABASE_URL
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host
ENV PORT=$PORT

# run the app
USER bun
EXPOSE $PORT/tcp

ENTRYPOINT [ "bun", "--bun", "run", "index.js" ]