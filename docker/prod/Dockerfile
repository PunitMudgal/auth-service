# syntax=docker/dockerfile:1

ARG BUN_VERSION=1

FROM oven/bun:${BUN_VERSION}-alpine AS builder

WORKDIR /home/bun/app

RUN apk add --no-cache python3 make g++

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY . .

RUN NODE_ENV=production bun run build:docker

FROM oven/bun:${BUN_VERSION}-alpine AS runner

# Keep the app outside /home: Azure App Service mounts persistent storage over
# /home, which can hide files baked into the image under /home/bun/app.
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache python3 make g++ \
    && addgroup -S app \
    && adduser -S -G app app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

COPY --from=builder --chown=app:app /home/bun/app/dist ./dist

USER app

EXPOSE 3000

# Absolute path so startup works even if the platform overrides the working directory.
CMD ["bun", "run", "/app/dist/server.js"]
