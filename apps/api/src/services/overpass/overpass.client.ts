/**
 * Overpass API client — fetches POI data from OpenStreetMap.
 *
 * Stateless pure functions, no NestJS dependency injection needed.
 * Handles nodes (direct lat/lon), ways and relations (center coordinates).
 */

const TIMEOUT_MS = 25_000;

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number; // nodes only
  lon?: number;
  center?: { lat: number; lon: number }; // ways + relations
  tags?: Record<string, string>;
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
    "[out:json][timeout:25];",
    "(",
    ...parts.map((p) => `  ${p}`),
    ");",
    "out center tags;",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
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
  } finally {
    clearTimeout(timer);
  }
}
