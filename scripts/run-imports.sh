#!/usr/bin/env bash
# run-imports.sh — Script d'import complet pour AeroDirectory
#
# Usage:
#   ./scripts/run-imports.sh              # Import complet
#   ./scripts/run-imports.sh --openaip    # Seulement aérodromes OpenAIP
#   ./scripts/run-imports.sh --osm        # Seulement POI OSM
#   ./scripts/run-imports.sh --regions    # Seulement régions
#   ./scripts/run-imports.sh --ourairports # Seulement liens OurAirports (site web, Wikipédia)
#   ./scripts/run-imports.sh --commons    # Seulement photos Wikimedia Commons
#
# Cron (tous les dimanches à 3h) :
#   0 3 * * 0 /opt/aerodirectory/scripts/run-imports.sh >> /var/log/aerodirectory-import.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

cd "$REPO_DIR"

echo "$LOG_PREFIX === Début des imports AeroDirectory ==="

# Charger le .env si présent
if [ -f "$REPO_DIR/.env" ]; then
  set -o allexport
  source "$REPO_DIR/.env"
  set +o allexport
fi

# Vérifier que DATABASE_URL est défini
if [ -z "${DATABASE_URL:-}" ]; then
  echo "$LOG_PREFIX ERREUR : DATABASE_URL non défini. Crée un fichier .env à la racine."
  exit 1
fi

# Mettre à jour le repo depuis git
echo "$LOG_PREFIX Mise à jour du repo..."
git pull --ff-only origin main || echo "$LOG_PREFIX Avertissement : git pull échoué, on continue avec la version actuelle"

# Reinstaller les dépendances si package.json a changé
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Compiler le package database (requis par les scripts tsx)
pnpm --filter @aerodirectory/database build

RUN_OPENAIP=false
RUN_OSM=false
RUN_REGIONS=false
RUN_OURAIRPORTS=false
RUN_COMMONS=false
RUN_ALL=true

for arg in "$@"; do
  case "$arg" in
    --openaip) RUN_OPENAIP=true; RUN_ALL=false ;;
    --osm)     RUN_OSM=true;     RUN_ALL=false ;;
    --regions) RUN_REGIONS=true; RUN_ALL=false ;;
    --ourairports) RUN_OURAIRPORTS=true; RUN_ALL=false ;;
    --commons) RUN_COMMONS=true; RUN_ALL=false ;;
  esac
done

if $RUN_ALL; then
  RUN_OPENAIP=true
  RUN_OSM=true
  RUN_REGIONS=true
  RUN_OURAIRPORTS=true
  RUN_COMMONS=true
fi

if $RUN_OPENAIP; then
  echo "$LOG_PREFIX Import OpenAIP (aérodromes)..."
  pnpm import:openaip && echo "$LOG_PREFIX Import OpenAIP terminé" || echo "$LOG_PREFIX ERREUR import OpenAIP"
fi

if $RUN_OSM; then
  echo "$LOG_PREFIX Import OSM (POI restaurants/transports/hébergements)..."
  pnpm import:osm && echo "$LOG_PREFIX Import OSM terminé" || echo "$LOG_PREFIX ERREUR import OSM"
fi

if $RUN_REGIONS; then
  echo "$LOG_PREFIX Sync régions..."
  pnpm sync:regions && echo "$LOG_PREFIX Sync régions terminé" || echo "$LOG_PREFIX ERREUR sync régions"
fi

# Après OpenAIP : les nouveaux aérodromes doivent exister pour recevoir leurs liens.
if $RUN_OURAIRPORTS; then
  echo "$LOG_PREFIX Import OurAirports (sites web, Wikipédia)..."
  pnpm import:ourairports && echo "$LOG_PREFIX Import OurAirports terminé" || echo "$LOG_PREFIX ERREUR import OurAirports"
fi

# Après OurAirports : les liens Wikipédia servent à trouver les aérodromes sans code OACI.
if $RUN_COMMONS; then
  echo "$LOG_PREFIX Import photos Wikimedia Commons..."
  pnpm import:commons && echo "$LOG_PREFIX Import Commons terminé" || echo "$LOG_PREFIX ERREUR import Commons"
fi

echo "$LOG_PREFIX === Imports terminés ==="
