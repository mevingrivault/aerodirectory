/**
 * openAIP Importer — fetches French aerodromes from openAIP and upserts them
 * into our local database.
 *
 * Idempotent: running multiple times will not create duplicates.
 * Uses source + sourceId as unique key for upserts.
 * Child collections (runways, frequencies) are replaced per airport inside a transaction.
 */

import type { PrismaClient } from "@prisma/client";
import { OpenAipClient } from "../../openaip/openaip.client";
import {
  normalizeOpenAipAirport,
  type NormalizedAerodrome,
} from "./openaip.normalizer";

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
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

  for (const raw of rawAirports) {
    try {
      normalized.push(normalizeOpenAipAirport(raw));
    } catch (error) {
      const msg = `Failed to normalize airport ${raw._id} (${raw.name}): ${error}`;
      console.warn(`  WARN: ${msg}`);
      normalizeErrors.push(msg);
    }
  }
  console.log(`  Normalized ${normalized.length} airports (${normalizeErrors.length} errors)\n`);

  // 3. Upsert into database
  console.log("[3/3] Upserting into database...");
  const result: ImportResult = {
    total: normalized.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [...normalizeErrors],
  };

  for (const airport of normalized) {
    try {
      const action = await upsertAirport(prisma, airport);
      if (action === "created") result.created++;
      else if (action === "updated") result.updated++;
      else result.skipped++;

      if ((result.created + result.updated + result.skipped) % 50 === 0) {
        console.log(
          `  Progress: ${result.created + result.updated + result.skipped}/${normalized.length}`,
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
  console.log(`  Created:        ${result.created}`);
  console.log(`  Updated:        ${result.updated}`);
  console.log(`  Skipped:        ${result.skipped}`);
  console.log(`  Errors:         ${result.errors.length}`);
  console.log("======================\n");

  return result;
}

async function upsertAirport(
  prisma: PrismaClient,
  airport: NormalizedAerodrome,
): Promise<"created" | "updated" | "skipped"> {
  const { runways, frequencies, ...aerodromeData } = airport;

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
    // Skip if data hasn't changed
    if (existing.sourceRawHash === airport.sourceRawHash) {
      return "skipped";
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
    });

    return "updated";
  }

  // Create new airport
  // Resolve ICAO conflicts (another airport may already have this ICAO)
  const icaoToSet = await resolveIcaoConflict(
    prisma,
    aerodromeData.icaoCode,
    null,
  );

  await prisma.aerodrome.create({
    data: {
      ...aerodromeData,
      icaoCode: icaoToSet,
      runways: runways.length > 0 ? { create: runways } : undefined,
      frequencies: frequencies.length > 0 ? { create: frequencies } : undefined,
    },
  });

  return "created";
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
