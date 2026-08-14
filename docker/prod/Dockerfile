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

RUN bun run build

FROM oven/bun:${BUN_VERSION}-alpine AS runner

WORKDIR /home/bun/app

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

CMD ["bun", "run", "dist/index.js"]
