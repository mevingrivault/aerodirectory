/**
 * Overpass API client — fetches POI data from OpenStreetMap.
 *
 * Stateless pure functions, no NestJS dependency injection needed.
 * Handles nodes (direct lat/lon), ways and relations (center coordinates).
 */

const TIMEOUT_MS = 10_000;

const FALLBACK_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number; // nodes only
  lon?: number;
  center?: { lat: number; lon: number }; // ways + relations
  tags?: Record<string, string>;
}

/**
 * Fetch OSM elements matching amenity tags inside a bounding box.
 * Bounding box: (south, west, north, east)
 */
export async function fetchOverpassBbox(
  south: number,
  west: number,
  north: number,
  east: number,
  amenities: string[],
  endpoint: string,
): Promise<OverpassElement[]> {
  const bbox = `${south},${west},${north},${east}`;
  const parts = amenities.flatMap((amenity) => [
    `node["amenity"="${amenity}"](${bbox});`,
    `way["amenity"="${amenity}"](${bbox});`,
    `relation["amenity"="${amenity}"](${bbox});`,
  ]);

  const query = [
    "[out:json][timeout:180];",
    "(",
    ...parts.map((p) => `  ${p}`),
    ");",
    "out center tags;",
  ].join("\n");

  const endpoints = [
    endpoint,
    ...FALLBACK_ENDPOINTS.filter((e) => e !== endpoint),
  ];

  let lastError: unknown;
  for (const ep of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 190_000);
    try {
      const response = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Overpass error: ${response.status} ${response.statusText}`);
      }
      const json = (await response.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/**
 * Fetch OSM elements matching the given amenity tags within a radius.
 *
 * Uses `out center tags` so ways/relations include their geographic center.
 */
export async function fetchOverpassNearby(
  lat: number,
  lon: number,
  radiusMeters: number,
  amenities: string[],
  endpoint: string,
): Promise<OverpassElement[]> {
  const parts = amenities.flatMap((amenity) => [
    `node["amenity"="${amenity}"](around:${radiusMeters},${lat},${lon});`,
    `way["amenity"="${amenity}"](around:${radiusMeters},${lat},${lon});`,
    `relation["amenity"="${amenity}"](around:${radiusMeters},${lat},${lon});`,
  ]);

  const query = [
    "[out:json][timeout:10];",
    "(",
    ...parts.map((p) => `  ${p}`),
    ");",
    "out center tags;",
  ].join("\n");

  // Try the configured endpoint first, then fallbacks
  const endpoints = [
    endpoint,
    ...FALLBACK_ENDPOINTS.filter((e) => e !== endpoint),
  ];

  let lastError: unknown;
  for (const ep of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Overpass error: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
