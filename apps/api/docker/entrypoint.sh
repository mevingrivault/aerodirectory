#!/bin/sh
set -eu

mkdir -p /tmp/navventura-uploads
chown -R apiuser:nodejs /tmp/navventura-uploads

SYNC_DATA_DIR="${SYNC_DATA_DIR:-/data/sync}"
mkdir -p "$SYNC_DATA_DIR"
chown -R apiuser:nodejs "$SYNC_DATA_DIR"

# Run Prisma migrations before starting the app.
echo "Running Prisma migrations..."
node /app/apps/api/docker/migrate.mjs

exec gosu apiuser node apps/api/dist/main
