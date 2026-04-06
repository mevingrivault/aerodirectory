/**
 * openAIP Importer — fetches French aerodromes from openAIP and upserts them
 * into our local database.
 *
 * Idempotent: running multiple times will not create duplicates.
 * Uses source + sourceId as unique key for upserts.
 * Child collections (runways, frequencies) are replaced per airport inside a transaction.
 */

import type { PrismaClient } from "@aerodirectory/database";
import { OpenAipClient } from "../../openaip/openaip.client";
import {
  normalizeOpenAipAirport,
  type NormalizedAerodrome,
} from "./openaip.normalizer";

export interface ImportResult {
  total: number;
  checked: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  changedAerodromeIds: string[];
}

export async function syncOpenAipFranceAirports(
  prisma: PrismaClient,
  apiKey: string,
): Promise<ImportResult> {
  console.log("\n=== openAIP France Airports Import ===\n");

  const client = new OpenAipClient(apiKey);

  // 1. Fetch all French airports from openAIP
  console.log("[1/3] Fetching airports from openAIP API...");
  const rawAirports = await client.getAirports("FR");
  console.log(`  Fetched ${rawAirports.length} airports from openAIP\n`);

  // 2. Normalize
  console.log("[2/3] Normalizing airport data...");
  const normalized: NormalizedAerodrome[] = [];
  const normalizeErrors: string[] = [];
  let excludedCount = 0;

  for (const raw of rawAirports) {
    if (isMedicalSite(raw.name)) {
      excludedCount++;
      continue;
    }
    try {
      normalized.push(normalizeOpenAipAirport(raw));
    } catch (error) {
      const msg = `Failed to normalize airport ${raw._id} (${raw.name}): ${error}`;
      console.warn(`  WARN: ${msg}`);
      normalizeErrors.push(msg);
    }
  }
  console.log(`  Normalized ${normalized.length} airports (${excludedCount} medical sites excluded, ${normalizeErrors.length} errors)\n`);

  // 3. Upsert into database
  console.log("[3/3] Upserting into database...");
  const result: ImportResult = {
    total: normalized.length,
    checked: normalized.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [...normalizeErrors],
    changedAerodromeIds: [],
  };

  for (const airport of normalized) {
    try {
      const { action, aerodromeId } = await upsertAirport(prisma, airport);
      if (action === "created") result.created++;
      else if (action === "updated") result.updated++;
      else result.unchanged++;
      if (aerodromeId && action !== "unchanged") {
        result.changedAerodromeIds.push(aerodromeId);
      }

      if ((result.created + result.updated + result.unchanged) % 50 === 0) {
        console.log(
          `  Progress: ${result.created + result.updated + result.unchanged}/${normalized.length}`,
        );
      }
    } catch (error) {
      const msg = `Failed to upsert ${airport.sourceId} (${airport.name}): ${error}`;
      console.error(`  ERROR: ${msg}`);
      result.errors.push(msg);
    }
  }

  console.log("\n=== Import Summary ===");
  console.log(`  Total fetched:  ${result.total}`);
  console.log(`  Checked:        ${result.checked}`);
  console.log(`  Created:        ${result.created}`);
  console.log(`  Updated:        ${result.updated}`);
  console.log(`  Unchanged:      ${result.unchanged}`);
  console.log(`  Errors:         ${result.errors.length}`);
  console.log("======================\n");

  return result;
}

async function upsertAirport(
  prisma: PrismaClient,
  airport: NormalizedAerodrome,
): Promise<{ action: "created" | "updated" | "unchanged"; aerodromeId: string | null }> {
  const { runways, frequencies, fuels, ...aerodromeData } = airport;

  // Check if this airport already exists by source+sourceId
  const existing = await prisma.aerodrome.findUnique({
    where: {
      source_sourceId: {
        source: airport.source,
        sourceId: airport.sourceId,
      },
    },
    select: { id: true, sourceRawHash: true, icaoCode: true },
  });

  if (existing) {
    // Mark the source as re-checked even when nothing changed.
    if (existing.sourceRawHash === airport.sourceRawHash) {
      await prisma.aerodrome.update({
        where: { id: existing.id },
        data: { lastSyncedAt: new Date() },
      });
      return { action: "unchanged", aerodromeId: existing.id };
    }

    // Update existing airport and replace children in a transaction
    await prisma.$transaction(async (tx) => {
      // If ICAO code changed and the new one conflicts, clear it
      const icaoToSet = await resolveIcaoConflict(
        tx as unknown as PrismaClient,
        aerodromeData.icaoCode,
        existing.id,
      );

      await tx.aerodrome.update({
        where: { id: existing.id },
        data: {
          ...aerodromeData,
          icaoCode: icaoToSet,
        },
      });

      // Replace runways
      await tx.runway.deleteMany({ where: { aerodromeId: existing.id } });
      if (runways.length > 0) {
        await tx.runway.createMany({
          data: runways.map((r) => ({ ...r, aerodromeId: existing.id })),
        });
      }

      // Replace frequencies
      await tx.frequency.deleteMany({ where: { aerodromeId: existing.id } });
      if (frequencies.length > 0) {
        await tx.frequency.createMany({
          data: frequencies.map((f) => ({ ...f, aerodromeId: existing.id })),
        });
      }

      // Replace fuels (sourced from OpenAIP)
      await tx.fuel.deleteMany({ where: { aerodromeId: existing.id } });
      if (fuels.length > 0) {
        await tx.fuel.createMany({
          data: fuels.map((f) => ({ ...f, aerodromeId: existing.id })),
        });
      }
    });

    return { action: "updated", aerodromeId: existing.id };
  }

  // Create new airport
  // Resolve ICAO conflicts (another airport may already have this ICAO)
  const icaoToSet = await resolveIcaoConflict(
    prisma,
    aerodromeData.icaoCode,
    null,
  );

  const created = await prisma.aerodrome.create({
    data: {
      ...aerodromeData,
      icaoCode: icaoToSet,
      runways: runways.length > 0 ? { create: runways } : undefined,
      frequencies: frequencies.length > 0 ? { create: frequencies } : undefined,
      fuels: fuels.length > 0 ? { create: fuels } : undefined,
    },
    select: { id: true },
  });

  return { action: "created", aerodromeId: created.id };
}

const MEDICAL_KEYWORDS = [
  "hospital",
  "hopital",
  "hôpital",
  "centre hospitalier",
  "chu ",
  "chr ",
  "hosp ",
  " hosp",
  "clinique",
  "médipôle",
  "medipole",
];

function isMedicalSite(name: string): boolean {
  const lower = name.toLowerCase();
  return MEDICAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * If the ICAO code already belongs to a different airport, return null
 * to avoid unique constraint violations. The source+sourceId is the
 * primary dedup key; ICAO is secondary.
 */
async function resolveIcaoConflict(
  prisma: PrismaClient,
  icaoCode: string | null,
  currentId: string | null,
): Promise<string | null> {
  if (!icaoCode) return null;

  const conflict = await prisma.aerodrome.findUnique({
    where: { icaoCode },
    select: { id: true },
  });

  if (conflict && conflict.id !== currentId) {
    console.warn(
      `  WARN: ICAO ${icaoCode} already used by aerodrome ${conflict.id} — skipping ICAO assignment`,
    );
    return null;
  }

  return icaoCode;
}
