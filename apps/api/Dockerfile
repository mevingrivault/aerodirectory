# ─── Stage 1: Base ───────────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# ─── Stage 2: Dependencies ───────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy manifests only (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod=false

# ─── Stage 3: Builder ────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy all source files
COPY packages/database/ ./packages/database/
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Generate Prisma client, build shared, then build API
RUN pnpm --filter @aerodirectory/database prisma:generate && \
    pnpm --filter @aerodirectory/shared build && \
    pnpm --filter @aerodirectory/api build

# ─── Stage 4: Runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy manifests for prod install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts and Prisma schema
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/src/generated ./packages/database/src/generated
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma

EXPOSE 4000

CMD ["node", "apps/api/dist/main"]
