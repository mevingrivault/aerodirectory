/**
 * Geometry helpers for the protected areas: Douglas-Peucker simplification
 * for display, bounding boxes, and point-to-area distance. Everything works
 * in a local equirectangular projection, accurate enough at the scale of an
 * aerodrome's surroundings.
 */

export type Position = [number, number]; // [lon, lat]
export type Ring = Position[];
export type AreaGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

const METRES_PER_DEGREE = 111_320;

const polygonsOf = (g: AreaGeometry): Ring[][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

/** Perpendicular distance (in degrees of latitude) from p to segment ab, longitudes scaled by `kx`. */
function segmentDistance(p: Position, a: Position, b: Position, kx: number): number {
  const ax = a[0] * kx, ay = a[1];
  const dx = b[0] * kx - ax, dy = b[1] - ay;
  const px = p[0] * kx - ax, py = p[1] - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
  return Math.hypot(px - t * dx, py - t * dy);
}

/** Douglas-Peucker on one ring; iterative, since rings reach tens of thousands of points. */
export function simplifyRing(ring: Ring, toleranceDeg: number): Ring {
  if (ring.length <= 4) return ring;
  const kx = Math.cos((ring[0]![1] * Math.PI) / 180);
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(ring[i]!, ring[start]!, ring[end]!, kx);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceDeg) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return ring.filter((_, i) => keep[i] === 1);
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

/**
 * Simplified copy, coordinates rounded to ~1 m. Rings that collapse below a
 * triangle are dropped, and so are polygons whose outer ring collapses.
 */
export function simplifyGeometry(geometry: AreaGeometry, toleranceDeg: number): AreaGeometry | null {
  const polygons: Ring[][] = [];
  for (const polygon of polygonsOf(geometry)) {
    const rings = polygon
      .map((ring) => simplifyRing(ring, toleranceDeg).map(([x, y]) => [round5(x), round5(y)] as Position))
      .map((ring) => ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1]![0] || p[1] !== ring[i - 1]![1]));
    const outer = rings[0];
    if (!outer || outer.length < 4) continue;
    polygons.push([outer, ...rings.slice(1).filter((r) => r.length >= 4)]);
  }
  if (polygons.length === 0) return null;
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0]! }
    : { type: "MultiPolygon", coordinates: polygons };
}

export function boundingBox(geometry: AreaGeometry) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const [lon, lat] of polygon[0] ?? []) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

export function pointCount(geometry: AreaGeometry): number {
  return polygonsOf(geometry).reduce((n, polygon) => n + polygon.reduce((m, ring) => m + ring.length, 0), 0);
}

function insideRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance in metres from a point to the area: 0 inside, else to the nearest edge. */
export function distanceToArea(lat: number, lon: number, geometry: AreaGeometry): number {
  const kx = Math.cos((lat * Math.PI) / 180);
  const p: Position = [lon, lat];
  let best = Infinity;
  for (const polygon of polygonsOf(geometry)) {
    const [outer, ...holes] = polygon;
    if (outer && insideRing(lon, lat, outer) && !holes.some((h) => insideRing(lon, lat, h))) return 0;
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const d = segmentDistance(p, ring[i - 1]!, ring[i]!, kx);
        if (d < best) best = d;
      }
    }
  }
  return Math.round(best * METRES_PER_DEGREE);
}
