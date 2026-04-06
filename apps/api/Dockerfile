FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate && \
    apk upgrade --no-cache zlib

FROM base AS fetch
WORKDIR /app
COPY pnpm-lock.yaml ./pnpm-workspace.yaml ./package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN pnpm fetch

FROM fetch AS builder
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --offline

RUN pnpm --filter @aerodirectory/database prisma:generate && \
    pnpm --filter @aerodirectory/database build && \
    pnpm --filter @aerodirectory/shared build && \
    pnpm --filter @aerodirectory/api build && \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true pnpm --ignore-scripts --filter @aerodirectory/api --prod deploy /prod/api && \
    PRISMA_CLIENT_DIR="$(find /app -path '*/node_modules/.prisma/client' -type d | head -n 1)" && \
    mkdir -p /prod/api/node_modules/.prisma /prod/api/node_modules/@prisma/client/.prisma && \
    cp -R "$PRISMA_CLIENT_DIR" /prod/api/node_modules/.prisma/client && \
    cp -R "$PRISMA_CLIENT_DIR" /prod/api/node_modules/@prisma/client/.prisma/client

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache clamav su-exec

COPY --from=builder /prod/api ./
COPY --from=builder /app/apps/api/docker/entrypoint.sh /entrypoint.sh

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser && \
    chmod +x /entrypoint.sh && \
    npm uninstall -g npm corepack || true

EXPOSE 4000

ENTRYPOINT ["/entrypoint.sh"]
