#!/usr/bin/env tsx

/**
 * CLI script to import French aerodromes from openAIP into the local database.
 *
 * Usage:
 *   pnpm import:openaip
 *
 * Requires:
 *   - DATABASE_URL in .env (or environment)
 *   - OPENAIP_API_KEY in .env (or environment)
 *   - PostgreSQL running with the latest migrations applied
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env file manually (tsx doesn't auto-load it)
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  let content: string;
  const raw = readFileSync(envPath);

  // Handle UTF-16 LE BOM (Windows PowerShell default)
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
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

import { PrismaClient } from "@aerodirectory/database";
import { syncOpenAipFranceAirports } from "../apps/api/src/services/importers/openaip/openaip.importer";
import { fetchOverpassBbox } from "../apps/api/src/services/overpass/overpass.client";
import type { OverpassElement } from "../apps/api/src/services/overpass/overpass.client";

const OVERPASS_ENDPOINT =
  process.env["OVERPASS_ENDPOINT"] ?? "https://overpass-api.de/api/interpreter";
const WALKABLE_RADIUS_METERS = 1_000;
const RESTAURANT_AMENITIES = ["restaurant", "cafe"];
// Grid cell size in degrees (~111km per degree lat, ~80km per degree lon in France)
const GRID_DEG = 5.0;
const GRID_MARGIN_DEG = 0.01;
const CELL_DELAY_MS = 5_000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function enrichRestaurantTags(prisma: PrismaClient): Promise<void> {
  console.log("\n[4/4] Enrichissement du tag hasRestaurant via Overpass...");

  const aerodromes = await prisma.aerodrome.findMany({
    where: { hasRestaurant: false },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  console.log(`  ${aerodromes.length} aérodromes à vérifier (rayon ${WALKABLE_RADIUS_METERS}m)`);
  if (aerodromes.length === 0) {
    console.log("  Rien à faire.\n");
    return;
  }

  // Group aerodromes by 1°×1° grid cell
  const cells = new Map<string, typeof aerodromes>();
  for (const ad of aerodromes) {
    const cellLat = Math.floor(ad.latitude / GRID_DEG);
    const cellLon = Math.floor(ad.longitude / GRID_DEG);
    const key = `${cellLat}:${cellLon}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(ad);
  }

  console.log(`  ${cells.size} cellules géographiques à interroger`);

  let tagged = 0;
  let errors = 0;
  let processed = 0;
  const cellEntries = [...cells.entries()];

  for (let ci = 0; ci < cellEntries.length; ci++) {
    const [key, cellAds] = cellEntries[ci]!;
    const [cellLatStr, cellLonStr] = key.split(":");
    const cellLat = Number(cellLatStr) * GRID_DEG;
    const cellLon = Number(cellLonStr) * GRID_DEG;

    const south = cellLat - GRID_MARGIN_DEG;
    const west = cellLon - GRID_MARGIN_DEG;
    const north = cellLat + GRID_DEG + GRID_MARGIN_DEG;
    const east = cellLon + GRID_DEG + GRID_MARGIN_DEG;

    try {
      const elements = await fetchOverpassBbox(
        south, west, north, east,
        RESTAURANT_AMENITIES,
        OVERPASS_ENDPOINT,
      );

      // For each aerodrome in this cell, check if any restaurant is within 1km
      for (const ad of cellAds) {
        const hasResto = elements.some((el: OverpassElement) => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (lat === undefined || lon === undefined) return false;
          return haversineMeters(ad.latitude, ad.longitude, lat, lon) <= WALKABLE_RADIUS_METERS;
        });

        if (hasResto) {
          await prisma.aerodrome.update({
            where: { id: ad.id },
            data: { hasRestaurant: true },
          });
          tagged++;
        }
        processed++;
      }

      console.log(`  [${ci + 1}/${cellEntries.length}] Cellule (${south.toFixed(1)},${west.toFixed(1)})→(${north.toFixed(1)},${east.toFixed(1)}) — ${cellAds.length} aérodromes, ${elements.length} POI OSM`);
    } catch (err) {
      errors += cellAds.length;
      console.warn(`  [${ci + 1}/${cellEntries.length}] ✗ Cellule ${key} — ${err}`);
    }

    if (ci < cellEntries.length - 1) {
      await new Promise((r) => setTimeout(r, CELL_DELAY_MS));
    }
  }

  console.log(`\n  Terminé : ${tagged} aérodromes tagués hasRestaurant=true, ${errors} erreurs (${processed} traités).\n`);
}

async function main() {
  const apiKey = process.env["OPENAIP_API_KEY"];
  if (!apiKey) {
    console.error("ERROR: OPENAIP_API_KEY environment variable is not set.");
    console.error("Add it to your .env file:");
    console.error("  OPENAIP_API_KEY=your_api_key_here");
    console.error("");
    console.error("Get your API key at: https://www.openaip.net/");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // Verify database connection
    await prisma.$connect();
    console.log("Connected to database.\n");

    const result = await syncOpenAipFranceAirports(prisma, apiKey);

    if (result.errors.length > 0) {
      console.error("Errors encountered during import:");
      for (const error of result.errors.slice(0, 10)) {
        console.error(`  - ${error}`);
      }
      if (result.errors.length > 10) {
        console.error(`  ... and ${result.errors.length - 10} more`);
      }
    }

    // Print final count
    const count = await prisma.aerodrome.count();
    console.log(`Total aerodromes in database: ${count}`);

    await enrichRestaurantTags(prisma);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
