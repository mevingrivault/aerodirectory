/**
 * Aerial lines importer — power lines of 63 kV and more and aerial ropeways
 * from IGN BD TOPO (Licence Ouverte), the wires a pilot cannot see coming.
 * Fetched from the Géoplateforme WFS in WGS 84; the table is rebuilt in one
 * transaction.
 */

import { z } from "zod";
import type { AerialLineKind, Prisma, PrismaClient } from "@aerodirectory/database";
import { wfsPageFetcher, type FetchPage } from "./wfs";

export const AERIAL_LINE_SOURCE = "ign-bdtopo";

const PAGE_SIZE = 1000;
const INSERT_BATCH = 500;
const TRANSACTION_TIMEOUT_MS = 5 * 60_000;
// ~14,500 power lines and ~1,400 ropeways expected.
const MIN_EXPECTED_LINES = 8_000;

// Objects that are physically there; projects and building sites are not yet.
const PRESENT = new Set(["En service", "Hors tension", "Non exploité"]);
// Ropeways off the ground; ski tows and conveyor belts run along it.
const AERIAL_ROPEWAYS = new Set([
  "Télésiège",
  "Télécabine, téléphérique",
  "Câble transporteur",
  "Tyrolienne géante",
  "Autre remontée mécanique",
]);

const Position = z.tuple([z.number(), z.number()]).rest(z.number());
const FeatureSchema = z.object({
  properties: z.object({
    cleabs: z.string(),
    voltage: z.string().nullish(),
    nature: z.string().nullish(),
    toponyme: z.string().nullish(),
    etat_de_l_objet: z.string().nullish(),
  }),
  geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(Position).min(2) }).nullable(),
});
const PageSchema = z.object({ features: z.array(z.unknown()) });

export interface NormalizedAerialLine {
  source: string;
  sourceId: string;
  kind: AerialLineKind;
  detail: string | null;
  name: string | null;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function normalizeAerialLine(raw: unknown, kind: AerialLineKind): NormalizedAerialLine | null {
  const parsed = FeatureSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.geometry) return null;
  const { properties: p, geometry } = parsed.data;
  if (p.etat_de_l_objet && !PRESENT.has(p.etat_de_l_objet)) return null;
  if (kind === "CABLE" && !AERIAL_ROPEWAYS.has(p.nature ?? "")) return null;

  // Drop the altitude, keep ~10 cm.
  const coordinates = geometry.coordinates.map(([lon, lat]) => [round6(lon), round6(lat)] as [number, number]);
  const lats = coordinates.map(([, lat]) => lat);
  const lons = coordinates.map(([lon]) => lon);
  const voltage = p.voltage && p.voltage !== "Inconnue" ? p.voltage : null;

  return {
    source: AERIAL_LINE_SOURCE,
    sourceId: p.cleabs,
    kind,
    detail: kind === "POWER_LINE" ? voltage : (p.nature ?? null),
    name: p.toponyme?.trim() || null,
    geometry: { type: "LineString", coordinates },
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}

const LAYERS: { kind: AerialLineKind; fetch: FetchPage }[] = [
  {
    kind: "POWER_LINE",
    fetch: wfsPageFetcher({
      layer: "BDTOPO_V3:ligne_electrique",
      properties: ["cleabs", "voltage", "etat_de_l_objet"],
      pageSize: PAGE_SIZE,
    }),
  },
  {
    kind: "CABLE",
    fetch: wfsPageFetcher({
      layer: "BDTOPO_V3:transport_par_cable",
      properties: ["cleabs", "nature", "toponyme", "etat_de_l_objet"],
      pageSize: PAGE_SIZE,
    }),
  },
];

export interface AerialLinesImportResult {
  fetched: number;
  imported: number;
  byKind: Record<string, number>;
}

export async function syncAerialLines(
  prisma: PrismaClient,
  layers: { kind: AerialLineKind; fetch: FetchPage }[] = LAYERS,
): Promise<AerialLinesImportResult> {
  const rows: NormalizedAerialLine[] = [];
  let fetched = 0;
  for (const layer of layers) {
    for (let start = 0; ; start += PAGE_SIZE) {
      const page = PageSchema.parse(await layer.fetch(start));
      fetched += page.features.length;
      for (const feature of page.features) {
        const line = normalizeAerialLine(feature, layer.kind);
        if (line) rows.push(line);
      }
      if (page.features.length < PAGE_SIZE) break;
    }
  }

  if (rows.length < MIN_EXPECTED_LINES) {
    throw new Error(`Seulement ${rows.length} lignes aériennes reçues de la Géoplateforme ; données existantes conservées.`);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.aerialLine.deleteMany({ where: { source: AERIAL_LINE_SOURCE } });
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await tx.aerialLine.createMany({
          data: rows.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, geometry: r.geometry as unknown as Prisma.InputJsonValue })),
        });
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );

  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  return { fetched, imported: rows.length, byKind };
}
