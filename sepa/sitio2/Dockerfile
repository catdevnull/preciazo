# syntax = docker/dockerfile:1

ARG BUN_VERSION=1.2.4
FROM node:22 AS base

RUN npm install -g bun@${BUN_VERSION}

LABEL fly_launch_runtime="SvelteKit"

WORKDIR /app

ENV NODE_ENV="production"

COPY package*.json ./

RUN bun install

COPY . .

RUN bun run build

FROM base AS final

RUN apt-get update && apt-get install -y vim rclone
RUN mkdir -p /root/.config/rclone && echo '[tigris]\n\ntype = s3\n\nprovider = AWS\n\nregion = auto\n\nendpoint = https://fly.storage.tigris.dev\n\nacl = public-read' > /root/.config/rclone/rclone.conf

COPY --from=base /app/build /app/build
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/package.json /app

EXPOSE 3000
CMD [ "node", "./build/index.js" ]
