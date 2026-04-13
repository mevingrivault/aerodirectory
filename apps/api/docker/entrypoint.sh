#!/bin/sh
set -eu

mkdir -p /tmp/navventura-uploads
chown -R apiuser:nodejs /tmp/navventura-uploads

SYNC_DATA_DIR="${SYNC_DATA_DIR:-/data/sync}"
mkdir -p "$SYNC_DATA_DIR"
chown -R apiuser:nodejs "$SYNC_DATA_DIR"

# Run Prisma migrations before starting the app.
# We copy the schema to /tmp to avoid prisma.config.ts (driver adapter)
# which is incompatible with migrate deploy. Prisma searches for prisma.config.ts
# by walking up from CWD — /tmp has no such file, so it falls back to schema URL.
echo "Running Prisma migrations..."
MIGRATE_TMP="$(mktemp -d)"
cp -r /app/packages/database/prisma "$MIGRATE_TMP/prisma"
sed -i 's|provider = "postgresql"|provider = "postgresql"\n  url      = env("DATABASE_URL")|' \
  "$MIGRATE_TMP/prisma/schema.prisma"
cd "$MIGRATE_TMP"
/app/packages/database/node_modules/.bin/prisma migrate deploy \
  --schema "$MIGRATE_TMP/prisma/schema.prisma"
cd /app
rm -rf "$MIGRATE_TMP"

exec gosu apiuser node apps/api/dist/main
