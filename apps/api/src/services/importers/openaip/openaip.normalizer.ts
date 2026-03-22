/**
 * Normalizes raw openAIP airport data to our internal DB format.
 *
 * Responsible for:
 * - Trimming strings
 * - Normalizing ICAO to uppercase
 * - Converting coordinates to decimal
 * - Converting elevation to feet
 * - Mapping surface/frequency/airport types to our enums
 * - Safely handling missing fields
 */

import type {
  OpenAipAirport,
  OpenAipRunway,
  OpenAipFrequency,
} from "../../openaip/openaip.client";
import type { AerodromeType, AerodromeStatus, SurfaceType, FrequencyType, FuelType } from "@aerodirectory/database";

// ─── Output types matching our Prisma schema ──────────────

export interface NormalizedAerodrome {
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null; // feet
  countryCode: string;
  aerodromeType: AerodromeType;
  status: AerodromeStatus;
  source: string;
  sourceId: string;
  sourceRawHash: string;
  lastSyncedAt: Date;
  runways: NormalizedRunway[];
  frequencies: NormalizedFrequency[];
  fuels: NormalizedFuel[];
}

export interface NormalizedRunway {
  identifier: string;
  length: number; // meters
  width: number | null; // meters
  surface: SurfaceType;
  lighting: boolean;
}

export interface NormalizedFrequency {
  type: FrequencyType;
  mhz: number;
  callsign: string | null;
  notes: string | null;
}

export interface NormalizedFuel {
  type: FuelType;
  available: boolean;
}

// ─── Type mappings ────────────────────────────────────────

const AIRPORT_TYPE_MAP: Record<number, AerodromeType> = {
  0: "OTHER",
  1: "GLIDER_SITE",
  2: "SMALL_AIRPORT",
  3: "ULTRALIGHT_FIELD",
  4: "OTHER", // hang glider → OTHER
  5: "INTERNATIONAL_AIRPORT",
  6: "HELIPORT",
  7: "MILITARY",
  8: "OTHER", // closed
  9: "SEAPLANE_BASE",
};

const SURFACE_TYPE_MAP: Record<number, SurfaceType> = {
  0: "ASPHALT",
  1: "CONCRETE",
  2: "GRASS",
  3: "DIRT", // sand/earth
  4: "GRAVEL",
  5: "WATER",
};

// OpenAIP fuel type codes → our FuelType enum (null = not mappable, skip)
const FUEL_TYPE_MAP: Record<number, FuelType | null> = {
  0: "AVGAS_100LL", // AVGAS
  1: "UL91",        // UL91
  2: "JET_A1",     // JET A1
  3: "JET_A1",     // JET A1 + JP4
  4: "JET_A1",     // JET B
  5: null,         // MOGAS E10 — not in our schema
  6: null,         // MOGAS 95
  7: null,         // MOGAS 98
  8: null,         // MOGAS 100
  9: null,         // other
};

const FREQUENCY_TYPE_MAP: Record<number, FrequencyType> = {
  0: "APP",     // approach
  1: "GROUND",  // apron
  2: "APP",     // arrival
  3: "APP",     // center
  4: "CTAF",    // CTAF
  5: "GROUND",  // delivery
  6: "APP",     // departure
  7: "FIS",     // FIS
  8: "OTHER",   // gliding
  9: "GROUND",  // ground
  10: "AFIS",   // info
  11: "OTHER",  // multicom
  12: "UNICOM", // unicom
  13: "APP",    // radar
  14: "TWR",    // tower
  15: "ATIS",   // ATIS
  16: "OTHER",  // radio
  17: "OTHER",  // other
  18: "OTHER",  // AIRMET
  19: "OTHER",  // AWOS
  20: "OTHER",  // light
  21: "OTHER",  // VOLMET
};

// ─── Normalizer ───────────────────────────────────────────

export function normalizeOpenAipAirport(
  raw: OpenAipAirport,
): NormalizedAerodrome {
  const icao = raw.icaoCode?.trim().toUpperCase() || null;
  const validIcao = icao && /^[A-Z]{4}$/.test(icao) ? icao : null;

  const [lng, lat] = raw.geometry?.coordinates ?? [0, 0];
  const elevation = normalizeElevationToFeet(raw.elevation);

  return {
    name: (raw.name || "").trim(),
    icaoCode: validIcao,
    latitude: lat,
    longitude: lng,
    elevation,
    countryCode: (raw.country || "FR").toUpperCase(),
    aerodromeType: AIRPORT_TYPE_MAP[raw.type] ?? "OTHER",
    status: (raw.type === 8 ? "CLOSED" : "OPEN") as AerodromeStatus,
    source: "openaip",
    sourceId: raw._id,
    sourceRawHash: simpleHash(JSON.stringify(raw)),
    lastSyncedAt: new Date(),
    runways: (raw.runways ?? [])
      .map(normalizeRunway)
      .filter((r): r is NormalizedRunway => r !== null),
    frequencies: (raw.frequencies ?? [])
      .map(normalizeFrequency)
      .filter((f): f is NormalizedFrequency => f !== null),
    fuels: normalizeFuels(raw.fuelTypes ?? []),
  };
}

function normalizeRunway(raw: OpenAipRunway): NormalizedRunway | null {
  const lengthM = convertToMeters(raw.dimension?.length);
  if (!lengthM || lengthM <= 0) return null;

  const widthM = convertToMeters(raw.dimension?.width);
  const surfaceCode = raw.surface?.mainComposite ?? -1;

  return {
    identifier: (raw.designator || "Unknown").trim(),
    length: Math.round(lengthM),
    width: widthM ? Math.round(widthM) : null,
    surface: SURFACE_TYPE_MAP[surfaceCode] ?? "OTHER",
    lighting: raw.pilotCtrlLighting ?? false,
  };
}

function normalizeFuels(fuelTypeCodes: number[]): NormalizedFuel[] {
  const seen = new Set<FuelType>();
  const result: NormalizedFuel[] = [];
  for (const code of fuelTypeCodes) {
    const fuelType = FUEL_TYPE_MAP[code];
    if (fuelType && !seen.has(fuelType)) {
      seen.add(fuelType);
      result.push({ type: fuelType, available: true });
    }
  }
  return result;
}

function normalizeFrequency(raw: OpenAipFrequency): NormalizedFrequency | null {
  const mhz = parseFloat(raw.value);
  if (isNaN(mhz) || mhz < 100 || mhz > 500) return null;

  return {
    type: FREQUENCY_TYPE_MAP[raw.type] ?? "OTHER",
    mhz: Math.round(mhz * 1000) / 1000, // 3 decimal precision
    callsign: raw.name?.trim() || null,
    notes: raw.primary ? "Primary" : null,
  };
}

// ─── Helpers ──────────────────────────────────────────────

function normalizeElevationToFeet(
  elevation?: { value: number; unit: number },
): number | null {
  if (!elevation || elevation.value == null) return null;

  if (elevation.unit === 1) {
    // Already in feet
    return Math.round(elevation.value);
  }
  // unit 0 = meters → convert to feet
  return Math.round(elevation.value * 3.28084);
}

function convertToMeters(
  dimension?: { value: number; unit: number },
): number | null {
  if (!dimension || dimension.value == null) return null;

  if (dimension.unit === 1) {
    // Feet → meters
    return dimension.value * 0.3048;
  }
  // unit 0 = already meters
  return dimension.value;
}

/**
 * Simple deterministic hash for change detection.
 * Not cryptographic — just for detecting whether the source data changed.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}
