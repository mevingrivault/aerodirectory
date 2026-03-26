#!/usr/bin/env tsx

/**
 * Sync aerodrome city and region fields via Nominatim reverse geocoding.
 *
 * Uses the OpenStreetMap Nominatim API to reverse-geocode each aerodrome
 * that has a null city or region, and fills in:
 *   city   — French commune name
 *   region — French administrative region (e.g. "Île-de-France")
 *
 * Nominatim free tier: 1 req/s max. The script enforces a 1.1 s delay
 * between requests to stay compliant.
 *
 * Usage:
 *   pnpm sync:regions
 *
 * Options:
 *   --all   Re-process aerodromes that already have city/region set
 *   --limit N  Process at most N aerodromes (for testing)
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

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const DELAY_MS = 1_100; // Nominatim: 1 req/s max

// French region normalisation map: some Nominatim responses use older names
const REGION_ALIASES: Record<string, string> = {
  "Alsace-Champagne-Ardenne-Lorraine": "Grand Est",
  "Nord-Pas-de-Calais-Picardie": "Hauts-de-France",
  "Aquitaine-Limousin-Poitou-Charentes": "Nouvelle-Aquitaine",
  "Languedoc-Roussillon-Midi-Pyrénées": "Occitanie",
  "Auvergne-Rhône-Alpes": "Auvergne-Rhône-Alpes",
  "Bourgogne-Franche-Comté": "Bourgogne-Franche-Comté",
  "Centre-Val de Loire": "Centre-Val de Loire",
  "Île-de-France": "Île-de-France",
  "Normandie": "Normandie",
  "Bretagne": "Bretagne",
  "Pays de la Loire": "Pays de la Loire",
  "Occitanie": "Occitanie",
  "Nouvelle-Aquitaine": "Nouvelle-Aquitaine",
  "Hauts-de-France": "Hauts-de-France",
  "Grand Est": "Grand Est",
  "Provence-Alpes-Côte d'Azur": "Provence-Alpes-Côte d'Azur",
  "Corse": "Corse",
  // DOM-TOM
  "Guadeloupe": "Guadeloupe",
  "Martinique": "Martinique",
  "Guyane": "Guyane",
  "La Réunion": "La Réunion",
  "Mayotte": "Mayotte",
};

interface NominatimResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    "ISO3166-2-lvl4"?: string;
  };
  error?: string;
}

async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<{ city: string | null; region: string | null }> {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&accept-language=fr&zoom=10`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "aerodirectory/1.0 (aerodirectory sync script)",
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data: NominatimResponse = await res.json();

  if (data.error || !data.address) {
    return { city: null, region: null };
  }

  const addr = data.address;

  // City: prefer city > town > village > municipality > county
  const city =
    addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? null;

  // Region: Nominatim returns French region in `state`
  const rawRegion = addr.state ?? null;
  const region = rawRegion ? (REGION_ALIASES[rawRegion] ?? rawRegion) : null;

  return { city, region };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes("--all");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]!) : undefined;

  const prisma = new PrismaClient();
  await prisma.$connect();

  const where = forceAll
    ? {}
    : { OR: [{ city: null }, { region: null }] };

  const aerodromes = await prisma.aerodrome.findMany({
    where,
    select: { id: true, name: true, latitude: true, longitude: true, city: true, region: true },
    orderBy: { name: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  console.log(
    `\n[sync:regions] ${aerodromes.length} aérodromes à géocoder${forceAll ? " (--all)" : " (city/region null seulement)"}`,
  );

  if (aerodromes.length === 0) {
    console.log("  Rien à faire.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < aerodromes.length; i++) {
    const ad = aerodromes[i]!;
    const progress = `[${i + 1}/${aerodromes.length}]`;

    try {
      const { city, region } = await reverseGeocode(ad.latitude, ad.longitude);

      await prisma.aerodrome.update({
        where: { id: ad.id },
        data: { city, region },
      });

      console.log(
        `  ${progress} ${ad.name.padEnd(30)} → ${city ?? "?"}, ${region ?? "?"}`,
      );
      updated++;
    } catch (err) {
      console.error(`  ${progress} ERREUR ${ad.name}: ${err}`);
      errors++;
    }

    // Rate-limit: wait before next request (not needed after the last one)
    if (i < aerodromes.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n=== Résumé sync:regions ===`);
  console.log(`  Mis à jour : ${updated}`);
  console.log(`  Erreurs    : ${errors}`);
  console.log(`  Total      : ${aerodromes.length}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
