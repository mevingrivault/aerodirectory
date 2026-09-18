#!/bin/sh
set -eu

mkdir -p /tmp/navventura-uploads
chown -R apiuser:nodejs /tmp/navventura-uploads

SYNC_DATA_DIR="${SYNC_DATA_DIR:-/data/sync}"
mkdir -p "$SYNC_DATA_DIR"
chown -R apiuser:nodejs "$SYNC_DATA_DIR"

# Prisma 7 + driver adapter cannot run `prisma migrate deploy` from a plain
# DATABASE_URL, so migrations go through the equivalent script.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "Applying Prisma migrations..."
  node /app/apps/api/docker/migrate.mjs
fi

exec gosu apiuser node apps/api/dist/main
