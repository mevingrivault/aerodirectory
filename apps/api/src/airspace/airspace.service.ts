import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AirspaceService {
  constructor(private readonly prisma: PrismaService) {}

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
    const airspaces = await this.prisma.airspace.findMany({
      where: {
        countryCode: "FR",
        ...(icaoClass ? { icaoClass } : {}),
        ...(type !== undefined ? { type } : {}),
      },
      select: {
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
      },
    });

    // Post-filter by bbox: check if geometry bbox overlaps the requested bbox
    // geometry is GeoJSON — we check the bounding box of each polygon
    return airspaces.filter((a) => geometryOverlapsBbox(a.geometry, minLat, minLng, maxLat, maxLng));
  }

  /** Returns a lightweight list of all airspaces (id + name + class + type) for legend/filter UI */
  async findAll(icaoClass?: string, type?: number) {
    return this.prisma.airspace.findMany({
      where: {
        countryCode: "FR",
        ...(icaoClass ? { icaoClass } : {}),
        ...(type !== undefined ? { type } : {}),
      },
      select: {
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
      },
      orderBy: { name: "asc" },
    });
  }
}

/**
 * Check if a GeoJSON Polygon/MultiPolygon geometry overlaps a lat/lng bounding box.
 * We compute the envelope of the geometry coordinates and test for overlap.
 */
function geometryOverlapsBbox(
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
