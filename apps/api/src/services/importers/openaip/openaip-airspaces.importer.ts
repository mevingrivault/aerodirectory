/**
 * openAIP Airspaces Importer — fetches French airspaces from openAIP and
 * upserts them into the local `airspaces` table.
 *
 * Idempotent: uses sourceId (openAIP _id) as unique key.
 * Hash-based change detection avoids unnecessary updates.
 */

import crypto from "crypto";
import type { PrismaClient } from "@aerodirectory/database";
import { OpenAipClient, type OpenAipAirspace, type OpenAipAltitude } from "../../openaip/openaip.client";

export interface AirspacesImportResult {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

// ─── ICAO class mapping ───────────────────────────────────
// openAIP numeric: 0=A,1=B,2=C,3=D,4=E,5=F,6=G,7=SPC
const ICAO_CLASS_LABELS: Record<number, string> = {
  0: "A",
  1: "B",
  2: "C",
  3: "D",
  4: "E",
  5: "F",
  6: "G",
  7: "SPC",
};

// ─── Altitude formatting ──────────────────────────────────
// referenceDatum: 0=MSL, 1=AGL, 2=FL
function formatAltitude(alt: OpenAipAltitude): string {
  if (alt.referenceDatum === 2) {
    // Flight level
    return `FL${String(alt.value).padStart(3, "0")}`;
  }
  const unitStr = alt.unit === 1 ? "m" : "ft";
  const refStr = alt.referenceDatum === 1 ? "AGL" : "MSL";
  if (alt.value === 0 && alt.referenceDatum !== 2) {
    return "SFC";
  }
  return `${alt.value}${unitStr} ${refStr}`;
}

/** Convert altitude to feet MSL for numeric filtering. Returns null for unknowns. */
function toFeetMsl(alt: OpenAipAltitude): number | null {
  if (alt.referenceDatum === 2) {
    // Flight level: 1 FL = 100 ft
    return alt.value * 100;
  }
  if (alt.referenceDatum === 1) {
    // AGL: we can't resolve to MSL without terrain — skip
    return null;
  }
  // MSL
  if (alt.unit === 1) {
    // meters to feet
    return Math.round(alt.value * 3.28084);
  }
  return alt.value; // already feet
}

function hashAirspace(raw: OpenAipAirspace): string {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(raw))
    .digest("hex");
}

// ─── Main export ─────────────────────────────────────────

export async function syncOpenAipAirspaces(
  prisma: PrismaClient,
  apiKey: string,
): Promise<AirspacesImportResult> {
  console.log("\n=== openAIP Airspaces Import ===\n");

  const client = new OpenAipClient(apiKey);

  console.log("[1/2] Fetching airspaces from openAIP API...");
  const rawAirspaces = await client.getAirspaces("FR");
  console.log(`  Fetched ${rawAirspaces.length} airspaces\n`);

  const result: AirspacesImportResult = {
    total: rawAirspaces.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  console.log("[2/2] Upserting into database...");

  for (const raw of rawAirspaces) {
    try {
      const hash = hashAirspace(raw);
      const sourceId = raw._id;

      const existing = await prisma.airspace.findUnique({
        where: { sourceId },
        select: { id: true, sourceRawHash: true },
      });

      if (existing) {
        if (existing.sourceRawHash === hash) {
          await prisma.airspace.update({
            where: { id: existing.id },
            data: { lastSyncedAt: new Date() },
          });
          result.unchanged++;
          continue;
        }

        await prisma.airspace.update({
          where: { id: existing.id },
          data: {
            ...normalizeAirspace(raw, hash),
            lastSyncedAt: new Date(),
          },
        });
        result.updated++;
      } else {
        await prisma.airspace.create({
          data: {
            ...normalizeAirspace(raw, hash),
            lastSyncedAt: new Date(),
          },
        });
        result.created++;
      }

      const done = result.created + result.updated + result.unchanged;
      if (done % 100 === 0) {
        console.log(`  Progress: ${done}/${rawAirspaces.length}`);
      }
    } catch (error) {
      const msg = `Failed to upsert airspace ${raw._id} (${raw.name}): ${error}`;
      console.error(`  ERROR: ${msg}`);
      result.errors.push(msg);
    }
  }

  console.log("\n=== Airspaces Import Summary ===");
  console.log(`  Total:     ${result.total}`);
  console.log(`  Created:   ${result.created}`);
  console.log(`  Updated:   ${result.updated}`);
  console.log(`  Unchanged: ${result.unchanged}`);
  console.log(`  Errors:    ${result.errors.length}`);
  console.log("================================\n");

  return result;
}

function normalizeAirspace(raw: OpenAipAirspace, hash: string) {
  return {
    sourceId: raw._id,
    sourceRawHash: hash,
    name: raw.name,
    type: raw.type,
    icaoClass: ICAO_CLASS_LABELS[raw.icaoClass] ?? String(raw.icaoClass),
    lowerLimit: formatAltitude(raw.lowerLimit),
    upperLimit: formatAltitude(raw.upperLimit),
    lowerLimitFt: toFeetMsl(raw.lowerLimit),
    upperLimitFt: toFeetMsl(raw.upperLimit),
    geometry: raw.geometry as object,
    countryCode: raw.country ?? "FR",
    activity: raw.activity ?? null,
    onDemand: raw.onDemand ?? false,
    onRequest: raw.onRequest ?? false,
    remarks: raw.remarks ?? null,
  };
}
