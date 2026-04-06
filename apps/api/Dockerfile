FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS fetch
WORKDIR /app
COPY pnpm-lock.yaml ./pnpm-workspace.yaml ./package.json ./
RUN pnpm fetch

FROM fetch AS builder
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --offline

RUN pnpm --filter @aerodirectory/database prisma:generate && \
    pnpm --filter @aerodirectory/database build && \
    pnpm --filter @aerodirectory/shared build && \
    pnpm --filter @aerodirectory/api build

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends clamav gosu osmium-tool tzdata && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/packages/database/prisma.config.ts ./packages/database/

COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/apps/api/docker/entrypoint.sh /entrypoint.sh

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 --no-create-home apiuser && \
    chmod +x /entrypoint.sh && \
    npm uninstall -g npm corepack || true

EXPOSE 4000

ENTRYPOINT ["/entrypoint.sh"]
