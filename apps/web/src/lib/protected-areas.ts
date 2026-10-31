/** Protected area near an aerodrome, as GET /aerodromes/:id/protected-areas returns it. */
export interface NearbyProtectedArea {
  id: string;
  name: string | null;
  kind: "NATIONAL_PARK" | "NATURE_RESERVE" | "BIOTOPE_PROTECTION" | "BIRD_SPA" | "SILENCE_ZONE";
  detail: string | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  distanceM: number;
}

export const PROTECTED_AREA_LABELS: Record<NearbyProtectedArea["kind"], string> = {
  NATIONAL_PARK: "Parc national (cœur)",
  NATURE_RESERVE: "Réserve naturelle",
  BIOTOPE_PROTECTION: "Protection de biotope",
  BIRD_SPA: "Natura 2000 oiseaux (ZPS)",
  SILENCE_ZONE: "Zone de silence",
};

export const PROTECTED_AREA_COLORS: Record<NearbyProtectedArea["kind"], string> = {
  NATIONAL_PARK: "#15803d",
  NATURE_RESERVE: "#65a30d",
  BIOTOPE_PROTECTION: "#0d9488",
  BIRD_SPA: "#ca8a04",
  SILENCE_ZONE: "#7c3aed",
};

/** "Aérodrome dans la zone" or "2,4 km · 1,3 NM" */
export function formatAreaDistance(metres: number): string {
  if (metres === 0) return "Aérodrome dans la zone";
  const km = (metres / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const nm = (metres / 1852).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `${km} km · ${nm} NM`;
}
