/**
 * openAIP Obstacles Importer — replaces the local `obstacles` table with the
 * French obstacles from openAIP (wind turbines, towers, chimneys…, mostly
 * mapped from OpenStreetMap).
 *
 * Obstacles have no local edits and come and go in large numbers, so the
 * table is rebuilt in one transaction instead of being diffed.
 */

import type { ObstacleType, PrismaClient } from "@aerodirectory/database";
import { OpenAipClient, type OpenAipObstacle } from "../../openaip/openaip.client";

export const OBSTACLE_SOURCE = "openaip";

const OBSTACLE_TYPES: Record<number, ObstacleType> = {
  0: "OBSTACLE",
  1: "CHIMNEY",
  2: "BUILDING",
  3: "WIND_TURBINE",
  4: "TOWER",
};

const INSERT_BATCH = 1000;
const TRANSACTION_TIMEOUT_MS = 5 * 60_000;

export interface NormalizedObstacle {
  source: string;
  sourceId: string;
  name: string | null;
  type: ObstacleType;
  latitude: number;
  longitude: number;
  heightM: number | null;
  elevationM: number | null;
}

export interface ObstaclesImportResult {
  fetched: number;
  imported: number;
  skipped: number;
  byType: Record<string, number>;
}

/** Metres, rounded; openAIP always gives obstacle heights in metres (unit 0). */
function metres(value: { value: number; unit: number } | undefined): number | null {
  if (!value || value.unit !== 0 || !Number.isFinite(value.value) || value.value < 0) return null;
  return Math.round(value.value);
}

export function normalizeOpenAipObstacle(raw: OpenAipObstacle): NormalizedObstacle | null {
  const [longitude, latitude] = raw.geometry?.coordinates ?? [];
  if (
    typeof latitude !== "number" || typeof longitude !== "number" ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) {
    return null;
  }
  return {
    source: OBSTACLE_SOURCE,
    sourceId: raw._id,
    name: raw.name?.trim() || null,
    type: OBSTACLE_TYPES[raw.type] ?? "OBSTACLE",
    latitude,
    longitude,
    heightM: metres(raw.height),
    elevationM: metres(raw.elevation),
  };
}

export async function syncOpenAipObstacles(
  prisma: PrismaClient,
  apiKey: string,
  client: Pick<OpenAipClient, "getObstacles"> = new OpenAipClient(apiKey),
): Promise<ObstaclesImportResult> {
  const raw = await client.getObstacles("FR");

  const seen = new Set<string>();
  const obstacles: NormalizedObstacle[] = [];
  for (const item of raw) {
    const obstacle = normalizeOpenAipObstacle(item);
    if (!obstacle || seen.has(obstacle.sourceId)) continue;
    seen.add(obstacle.sourceId);
    obstacles.push(obstacle);
  }

  // An empty answer is far more likely an API problem than France losing
  // every obstacle overnight: keep the current data.
  if (obstacles.length === 0) {
    throw new Error("openAIP n'a renvoyé aucun obstacle exploitable ; données existantes conservées.");
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.obstacle.deleteMany({ where: { source: OBSTACLE_SOURCE } });
      for (let i = 0; i < obstacles.length; i += INSERT_BATCH) {
        await tx.obstacle.createMany({ data: obstacles.slice(i, i + INSERT_BATCH) });
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );

  const byType: Record<string, number> = {};
  for (const o of obstacles) byType[o.type] = (byType[o.type] ?? 0) + 1;

  return { fetched: raw.length, imported: obstacles.length, skipped: raw.length - obstacles.length, byType };
}
