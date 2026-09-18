import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../common/cache.service";

/** Airspaces change once a night (openAIP sync); the map asks for them on every pan. */
const AIRSPACES_CACHE_KEY = "airspaces:fr:v1";
const AIRSPACES_CACHE_TTL_SECONDS = 60 * 60;

const AIRSPACE_SELECT = {
  id: true,
  name: true,
  type: true,
  icaoClass: true,
  lowerLimit: true,
  upperLimit: true,
  lowerLimitFt: true,
  upperLimitFt: true,
  geometry: true,
  activity: true,
  onDemand: true,
  onRequest: true,
  remarks: true,
} as const;

type AirspaceRow = {
  id: string;
  name: string;
  type: number;
  icaoClass: string;
  lowerLimit: string;
  upperLimit: string;
  lowerLimitFt: number | null;
  upperLimitFt: number | null;
  geometry: unknown;
  activity: number | null;
  onDemand: boolean;
  onRequest: boolean;
  remarks: string | null;
};

@Injectable()
export class AirspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Returns all airspaces within a bounding box, optionally filtered by ICAO class or type.
   * Used by the map to fetch visible airspaces for the current viewport.
   */
  async findByBbox(
    minLat: number,
    minLng: number,
    maxLat: number,
    maxLng: number,
    icaoClass?: string,
    type?: number,
  ) {
    const all = await this.loadAll();
    return all
      .filter((a) => matchesFilters(a, icaoClass, type))
      .filter((a) => geometryOverlapsBbox(a.geometry, minLat, minLng, maxLat, maxLng));
  }

  /** Returns all French airspaces, optionally filtered by ICAO class or type. */
  async findAll(icaoClass?: string, type?: number) {
    const all = await this.loadAll();
    return all.filter((a) => matchesFilters(a, icaoClass, type));
  }

  /** Whole French set, read from the database at most once per hour per instance. */
  private loadAll(): Promise<AirspaceRow[]> {
    return this.cache.getOrSet(AIRSPACES_CACHE_KEY, AIRSPACES_CACHE_TTL_SECONDS, () =>
      this.prisma.airspace.findMany({
        where: { countryCode: "FR" },
        select: AIRSPACE_SELECT,
        orderBy: { name: "asc" },
      }),
    );
  }
}

function matchesFilters(a: AirspaceRow, icaoClass?: string, type?: number): boolean {
  if (icaoClass && a.icaoClass !== icaoClass) return false;
  if (type !== undefined && a.type !== type) return false;
  return true;
}

/**
 * Check if a GeoJSON Polygon/MultiPolygon geometry overlaps a lat/lng bounding box.
 * We compute the envelope of the geometry coordinates and test for overlap.
 */
export function geometryOverlapsBbox(
  geometry: unknown,
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): boolean {
  if (!geometry || typeof geometry !== "object") return false;
  const geo = geometry as { type: string; coordinates: unknown };

  let allCoords: number[][] = [];

  if (geo.type === "Polygon") {
    allCoords = flattenRings(geo.coordinates as number[][][]);
  } else if (geo.type === "MultiPolygon") {
    for (const polygon of geo.coordinates as number[][][][]) {
      allCoords.push(...flattenRings(polygon));
    }
  } else {
    return true; // unknown type — include by default
  }

  if (allCoords.length === 0) return false;

  let gMinLng = Infinity, gMaxLng = -Infinity;
  let gMinLat = Infinity, gMaxLat = -Infinity;

  for (const coord of allCoords) {
    const lng = coord[0] as number;
    const lat = coord[1] as number;
    if (lng < gMinLng) gMinLng = lng;
    if (lng > gMaxLng) gMaxLng = lng;
    if (lat < gMinLat) gMinLat = lat;
    if (lat > gMaxLat) gMaxLat = lat;
  }

  // Overlap check: two rectangles overlap if neither is entirely outside the other
  return gMaxLng >= minLng && gMinLng <= maxLng && gMaxLat >= minLat && gMinLat <= maxLat;
}

function flattenRings(rings: number[][][]): number[][] {
  const out: number[][] = [];
  for (const ring of rings) {
    for (const coord of ring) {
      out.push(coord);
    }
  }
  return out;
}
