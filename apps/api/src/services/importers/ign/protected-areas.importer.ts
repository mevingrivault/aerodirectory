/**
 * Protected areas importer — the zones of IGN BD TOPO `parc_ou_reserve`
 * (Licence Ouverte 2.0) that matter when overflying: national park cores,
 * nature reserves, biotope protection orders, Natura 2000 bird areas and
 * silence zones. Fetched from the Géoplateforme WFS in WGS 84, simplified for
 * display, and the table is rebuilt in one transaction.
 */

import { z } from "zod";
import type { PrismaClient, ProtectedAreaKind } from "@aerodirectory/database";
import { boundingBox, pointCount, simplifyGeometry, type AreaGeometry } from "./protected-areas.geometry";

export const PROTECTED_AREA_SOURCE = "ign-bdtopo";

const WFS_URL = "https://data.geopf.fr/wfs/ows";
const LAYER = "BDTOPO_V3:parc_ou_reserve";
// Server-side pre-filter; kindOf() makes the final choice.
const CQL_FILTER =
  "nature IN ('Parc national','Réserve naturelle','Arrêté de protection','Zone de silence') " +
  "OR nature_detaillee='Site inscrit au titre de la Directive Oiseaux'";
const PAGE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 120_000;
// ~30 m: invisible at the zoom levels of an aerodrome map, divides the points by ~10.
const SIMPLIFY_TOLERANCE_DEG = 0.0003;
const INSERT_BATCH = 100;
const TRANSACTION_TIMEOUT_MS = 5 * 60_000;
// Far fewer than the ~2,000 expected means a broken answer, not a policy change.
const MIN_EXPECTED_AREAS = 500;

/** Which BD TOPO zones we keep, and as what. */
export function kindOf(nature: string | null | undefined, detail: string | null | undefined): ProtectedAreaKind | null {
  switch (nature) {
    case "Parc national":
      return detail === "Aire d'adhésion" ? null : "NATIONAL_PARK";
    case "Réserve naturelle":
      return detail === "Périmètre de protection d'une réserve naturelle nationale" ? null : "NATURE_RESERVE";
    case "Arrêté de protection":
      return detail === "Arrêté de protection de géotope" ? null : "BIOTOPE_PROTECTION";
    case "Site Natura 2000":
      return detail === "Site inscrit au titre de la Directive Oiseaux" ? "BIRD_SPA" : null;
    case "Zone de silence":
      return "SILENCE_ZONE";
    default:
      return null;
  }
}

const Position = z.tuple([z.number(), z.number()]).rest(z.number());
const FeatureSchema = z.object({
  properties: z.object({
    cleabs: z.string(),
    nature: z.string().nullish(),
    nature_detaillee: z.string().nullish(),
    toponyme: z.string().nullish(),
    sources: z.string().nullish(),
    identifiants_sources: z.string().nullish(),
  }),
  geometry: z.union([
    z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(Position)) }),
    z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(Position))) }),
  ]).nullable(),
});
const PageSchema = z.object({ features: z.array(z.unknown()), numberMatched: z.number().optional() });

export interface NormalizedProtectedArea {
  source: string;
  sourceId: string;
  name: string | null;
  kind: ProtectedAreaKind;
  detail: string | null;
  geometry: AreaGeometry;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** How to recognise the same zone listed twice, and which copy is newer. */
interface Provenance {
  key: string;
  year: number;
}

function provenanceOf(
  area: NormalizedProtectedArea,
  sources: string | null | undefined,
  identifiers: string | null | undefined,
): Provenance {
  // "MNHN:FR9300025/RNF:RNR190": the national inventory id names the zone.
  const mnhnId = identifiers?.match(/MNHN:([A-Z0-9]+)/)?.[1];
  const years = (sources?.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number);
  return {
    key: mnhnId
      ? `${area.kind}|mnhn:${mnhnId}`
      : [area.kind, area.minLat, area.maxLat, area.minLon, area.maxLon].join("|"),
    year: years.length ? Math.max(...years) : 0,
  };
}

export function normalizeFeature(raw: unknown): (NormalizedProtectedArea & { provenance: Provenance }) | null {
  const parsed = FeatureSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.geometry) return null;
  const { properties: p, geometry } = parsed.data;
  const kind = kindOf(p.nature, p.nature_detaillee);
  if (!kind) return null;

  // Drop any third coordinate before simplifying.
  const flat = (geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: geometry.coordinates.map((r) => r.map(([x, y]) => [x, y])) }
    : { type: "MultiPolygon", coordinates: geometry.coordinates.map((pl) => pl.map((r) => r.map(([x, y]) => [x, y]))) }
  ) as AreaGeometry;
  const simplified = simplifyGeometry(flat, SIMPLIFY_TOLERANCE_DEG);
  if (!simplified) return null;

  const area: NormalizedProtectedArea = {
    source: PROTECTED_AREA_SOURCE,
    sourceId: p.cleabs,
    name: p.toponyme?.trim() || null,
    kind,
    detail: p.nature_detaillee?.trim() || null,
    geometry: simplified,
    ...boundingBox(simplified),
  };
  return { ...area, provenance: provenanceOf(area, p.sources, p.identifiants_sources) };
}

export type FetchPage = (startIndex: number) => Promise<unknown>;

export const fetchWfsPage: FetchPage = async (startIndex) => {
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: LAYER,
    OUTPUTFORMAT: "application/json",
    SRSNAME: "EPSG:4326",
    PROPERTYNAME: "cleabs,nature,nature_detaillee,toponyme,sources,identifiants_sources,geometrie",
    SORTBY: "cleabs",
    COUNT: String(PAGE_SIZE),
    STARTINDEX: String(startIndex),
    CQL_FILTER,
  });
  const res = await fetch(`${WFS_URL}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Géoplateforme WFS: HTTP ${res.status}`);
  return res.json();
};

export interface ProtectedAreasImportResult {
  fetched: number;
  imported: number;
  byKind: Record<string, number>;
  pointsAfterSimplification: number;
}

export async function syncProtectedAreas(
  prisma: PrismaClient,
  fetchPage: FetchPage = fetchWfsPage,
): Promise<ProtectedAreasImportResult> {
  // BD TOPO sometimes lists a zone twice, from two inventory releases and
  // under two names (e.g. "Val et Coteau de Saint-Rémy" and "Réserve
  // Naturelle Régionale du Val et…"). One row per zone: the newer outline,
  // the longer name.
  const areas = new Map<string, NormalizedProtectedArea & { provenance: Provenance }>();
  let fetched = 0;
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = PageSchema.parse(await fetchPage(start));
    fetched += page.features.length;
    for (const feature of page.features) {
      const area = normalizeFeature(feature);
      if (!area) continue;
      const existing = areas.get(area.provenance.key);
      if (!existing) {
        areas.set(area.provenance.key, area);
        continue;
      }
      const newer = area.provenance.year > existing.provenance.year ? area : existing;
      const longerName = (area.name?.length ?? 0) > (existing.name?.length ?? 0) ? area.name : existing.name;
      areas.set(area.provenance.key, { ...newer, name: longerName });
    }
    if (page.features.length < PAGE_SIZE) break;
  }

  const rows: NormalizedProtectedArea[] = [...areas.values()].map(({ provenance: _, ...row }) => row);
  if (rows.length < MIN_EXPECTED_AREAS) {
    throw new Error(`Seulement ${rows.length} zones protégées reçues de la Géoplateforme ; données existantes conservées.`);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.protectedArea.deleteMany({ where: { source: PROTECTED_AREA_SOURCE } });
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await tx.protectedArea.createMany({ data: rows.slice(i, i + INSERT_BATCH) });
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );

  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  return {
    fetched,
    imported: rows.length,
    byKind,
    pointsAfterSimplification: rows.reduce((n, r) => n + pointCount(r.geometry), 0),
  };
}
