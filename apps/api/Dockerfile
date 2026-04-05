# ─── Stage 1: Base ───────────────────────────────────────────────────────────
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate && \
    apk upgrade --no-cache zlib

# ─── Stage 2: Fetch dependencies (lockfile only) ─────────────────────────────
FROM base AS fetch
WORKDIR /app
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ─── Stage 3: Builder ────────────────────────────────────────────────────────
FROM fetch AS builder
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --offline

RUN pnpm --filter @aerodirectory/database prisma:generate && \
    pnpm --filter @aerodirectory/database build && \
    pnpm --filter @aerodirectory/shared build && \
    pnpm --filter @aerodirectory/api build

# ─── Stage 4: Runner ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules and built artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma

COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/database/package.json ./packages/database/

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser && \
    npm uninstall -g npm corepack || true

USER apiuser

EXPOSE 4000

CMD ["node", "apps/api/dist/main"]
