# ─── Stage 1: Base ───────────────────────────────────────────────────────────
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# ─── Stage 2: Fetch dependencies (lockfile only) ─────────────────────────────
FROM base AS fetch
WORKDIR /app
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ─── Stage 3: Builder ────────────────────────────────────────────────────────
FROM fetch AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .
RUN pnpm install --frozen-lockfile --offline

RUN pnpm --filter @aerodirectory/shared build && \
    pnpm --filter @aerodirectory/web build

# ─── Stage 4: Runner ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# public/ may be empty but must exist
RUN mkdir -p ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
