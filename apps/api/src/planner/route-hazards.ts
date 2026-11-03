import { haversineNm } from "@aerodirectory/shared";
import type { Place } from "./planner.calc";

/**
 * Where a straight route meets airspaces and obstacles. Each leg is flattened
 * on a local plane (x = longitude × cos(latitude)), close enough over the
 * few hundred miles of a light-aircraft leg.
 */

/** openAIP types a VFR pilot has to know about on the way: R, D, P, CTR, TMA, RMZ, TMZ, ATZ, HTZ, glider sectors, TIZ, TIA. */
export const ROUTE_AIRSPACE_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 11, 18, 19, 21, 22]);
/** Airspaces whose floor is above this are flown under. */
export const ROUTE_AIRSPACE_FLOOR_FT = 6500;
export const ROUTE_OBSTACLE_CORRIDOR_NM = 1;

type Ring = number[][]; // [lon, lat][]

interface Segment {
  from: Place;
  to: Place;
  startNm: number; // distance along the route at `from`
  lengthNm: number;
  cosLat: number;
}

function segments(points: Place[]): Segment[] {
  const out: Segment[] = [];
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const lengthNm = haversineNm(from.latitude, from.longitude, to.latitude, to.longitude);
    out.push({ from, to, startNm: along, lengthNm, cosLat: Math.cos((((from.latitude + to.latitude) / 2) * Math.PI) / 180) });
    along += lengthNm;
  }
  return out;
}

function polygons(geometry: unknown): Ring[][] {
  const geo = geometry as { type?: string; coordinates?: unknown } | null;
  if (geo?.type === "Polygon") return [geo.coordinates as Ring[]];
  if (geo?.type === "MultiPolygon") return geo.coordinates as Ring[][];
  return [];
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside its holes. */
export function inPolygon(place: Place, rings: Ring[]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(place.longitude, place.latitude, outer)) return false;
  return !holes.some((hole) => inRing(place.longitude, place.latitude, hole));
}

/** Fraction t ∈ [0, 1] along a→b where it crosses c→d, or null. */
function crossing(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number | null {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / denom;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Distance along the route where it first enters the geometry, or null if it never does. */
export function routeEntryNm(points: Place[], geometry: unknown): number | null {
  const shapes = polygons(geometry);
  if (shapes.length === 0) return null;
  for (const seg of segments(points)) {
    if (shapes.some((rings) => inPolygon(seg.from, rings))) return seg.startNm;
    let first: number | null = null;
    const ax = seg.from.longitude * seg.cosLat, ay = seg.from.latitude;
    const bx = seg.to.longitude * seg.cosLat, by = seg.to.latitude;
    for (const rings of shapes) {
      for (const ring of rings) {
        for (let i = 1; i < ring.length; i++) {
          const [cx, cy] = ring[i - 1] as [number, number];
          const [dx, dy] = ring[i] as [number, number];
          const t = crossing(ax, ay, bx, by, cx * seg.cosLat, cy, dx * seg.cosLat, dy);
          if (t != null && (first == null || t < first)) first = t;
        }
      }
    }
    if (first != null) return seg.startNm + first * seg.lengthNm;
  }
  return null;
}

/** Closest point of the route to a place: distance along it and off it, in NM. */
export function routeOffset(points: Place[], place: Place): { alongNm: number; offsetNm: number } {
  let best = { alongNm: 0, offsetNm: Infinity };
  for (const seg of segments(points)) {
    // NM on the local plane: 1° of latitude = 60 NM.
    const ax = seg.from.longitude * seg.cosLat * 60, ay = seg.from.latitude * 60;
    const bx = seg.to.longitude * seg.cosLat * 60, by = seg.to.latitude * 60;
    const px = place.longitude * seg.cosLat * 60, py = place.latitude * 60;
    const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSq));
    const offsetNm = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
    if (offsetNm < best.offsetNm) best = { alongNm: seg.startNm + t * seg.lengthNm, offsetNm };
  }
  return best;
}

/** Latitude/longitude box around each leg, widened by `marginNm`, for a database query. */
export function legBoxes(points: Place[], marginNm: number) {
  return segments(points).map((seg) => {
    const dLat = marginNm / 60;
    const dLon = marginNm / (60 * Math.max(seg.cosLat, 0.01));
    return {
      latitude: { gte: Math.min(seg.from.latitude, seg.to.latitude) - dLat, lte: Math.max(seg.from.latitude, seg.to.latitude) + dLat },
      longitude: { gte: Math.min(seg.from.longitude, seg.to.longitude) - dLon, lte: Math.max(seg.from.longitude, seg.to.longitude) + dLon },
    };
  });
}
