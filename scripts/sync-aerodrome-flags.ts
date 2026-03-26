#!/usr/bin/env tsx

/**
 * Sync aerodrome service flags from OSM POIs.
 *
 * Reads the `osm.pois` table (populated by `pnpm import:osm`) and updates
 * the four boolean flags on every aerodrome based on proximity:
 *   hasRestaurant  — RESTAURANT POI within 1 000 m
 *   hasBikes       — BIKE POI within 1 000 m
 *   hasTransport   — TRANSPORT POI within 1 500 m
 *   hasAccommodation — ACCOMMODATION POI within 1 500 m
 *
 * Usage:
 *   pnpm sync:flags
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ─── Env loader ──────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  let content: string;
  const raw = readFileSync(envPath);
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    content = raw.toString("utf16le").replace(/^\uFEFF/, "");
  } else {
    content = raw.toString("utf-8").replace(/^\uFEFF/, "");
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

// ─── Main ────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@aerodirectory/database";

// Proximity radii in metres
const RADIUS = 1_000; // metres — uniform for all categories

// Bounding-box half-side in degrees (generous margin for the pre-filter)
const BOX_DEG = 0.025; // ~2.8 km, safely covers the largest radius

interface FlagRow {
  id: string;
  hasRestaurant: boolean;
  hasBikes: boolean;
  hasTransport: boolean;
  hasAccommodation: boolean;
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log("\n[sync:flags] Calcul des flags depuis osm.pois…");

  // Check that osm.pois has data
  const poiCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS count FROM osm.pois
  `;
  const total = Number(poiCount[0]?.count ?? 0);
  if (total === 0) {
    console.warn(
      "  ⚠  La table osm.pois est vide. Lancez d'abord `pnpm import:osm`.",
    );
    await prisma.$disconnect();
    return;
  }
  console.log(`  ${total.toLocaleString()} POI dans osm.pois`);

  // One SQL pass: spatial join on bounding box + haversine, all categories at once
  const rows = await prisma.$queryRaw<FlagRow[]>`
    SELECT
      a.id,
      COALESCE(bool_or(p.category = 'RESTAURANT'    AND dist <= ${RADIUS}), FALSE) AS "hasRestaurant",
      COALESCE(bool_or(p.category = 'BIKE'          AND dist <= ${RADIUS}), FALSE) AS "hasBikes",
      COALESCE(bool_or(p.category = 'TRANSPORT'     AND dist <= ${RADIUS}), FALSE) AS "hasTransport",
      COALESCE(bool_or(p.category = 'ACCOMMODATION' AND dist <= ${RADIUS}), FALSE) AS "hasAccommodation"
    FROM public.aerodromes a
    LEFT JOIN LATERAL (
      SELECT
        p.category,
        2 * 6371000 * asin(sqrt(
          power(sin(radians((p.lat - a.latitude)  / 2)), 2) +
          cos(radians(a.latitude)) * cos(radians(p.lat)) *
          power(sin(radians((p.lon - a.longitude) / 2)), 2)
        )) AS dist
      FROM osm.pois p
      WHERE
        p.lat BETWEEN a.latitude  - ${BOX_DEG} AND a.latitude  + ${BOX_DEG}
        AND p.lon BETWEEN a.longitude - ${BOX_DEG} AND a.longitude + ${BOX_DEG}
    ) p ON TRUE
    GROUP BY a.id
  `;

  console.log(`  ${rows.length} aérodromes calculés`);

  // Bulk-update by flag combination to minimise round-trips
  let updated = 0;
  const BATCH = 200;

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);

    await Promise.all(
      slice.map((r) =>
        prisma.aerodrome.update({
          where: { id: r.id },
          data: {
            hasRestaurant:    r.hasRestaurant,
            hasBikes:         r.hasBikes,
            hasTransport:     r.hasTransport,
            hasAccommodation: r.hasAccommodation,
          },
        }),
      ),
    );

    updated += slice.length;
    if (updated % 1_000 === 0 || updated === rows.length) {
      console.log(`  ${updated}/${rows.length} mis à jour…`);
    }
  }

  // Summary
  const byFlag = {
    hasRestaurant:    rows.filter((r) => r.hasRestaurant).length,
    hasBikes:         rows.filter((r) => r.hasBikes).length,
    hasTransport:     rows.filter((r) => r.hasTransport).length,
    hasAccommodation: rows.filter((r) => r.hasAccommodation).length,
  };

  console.log("\n=== Résumé sync:flags ===");
  console.log(`  hasRestaurant    : ${byFlag.hasRestaurant}`);
  console.log(`  hasBikes         : ${byFlag.hasBikes}`);
  console.log(`  hasTransport     : ${byFlag.hasTransport}`);
  console.log(`  hasAccommodation : ${byFlag.hasAccommodation}`);
  console.log(`  Total mis à jour : ${updated}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
