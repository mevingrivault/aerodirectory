#!/bin/sh
set -eu

mkdir -p /var/lib/clamav /tmp/navventura-uploads
chown -R apiuser:nodejs /tmp/navventura-uploads

if [ "${CLAMSCAN_ENABLED:-true}" = "true" ] && command -v clamscan >/dev/null 2>&1; then
  if [ "${CLAMSCAN_AUTO_UPDATE:-true}" = "true" ]; then
    echo "Updating ClamAV signatures..."
    freshclam --stdout || echo "freshclam failed, uploads will be refused until signatures are available."
  fi
  chown -R apiuser:nodejs /var/lib/clamav || true
fi

exec su-exec apiuser node dist/main
