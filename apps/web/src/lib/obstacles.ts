/** Obstacle near an aerodrome, as GET /aerodromes/:id/obstacles returns it. */
export interface NearbyObstacle {
  id: string;
  name: string | null;
  type: "OBSTACLE" | "CHIMNEY" | "BUILDING" | "WIND_TURBINE" | "TOWER";
  latitude: number;
  longitude: number;
  heightM: number | null;
  elevationM: number | null;
  distanceM: number;
  bearingDeg: number;
}

export const OBSTACLE_LABELS: Record<NearbyObstacle["type"], string> = {
  OBSTACLE: "Obstacle",
  CHIMNEY: "Cheminée",
  BUILDING: "Bâtiment",
  WIND_TURBINE: "Éolienne",
  TOWER: "Pylône / tour",
};

export const OBSTACLE_COLORS: Record<NearbyObstacle["type"], string> = {
  OBSTACLE: "#dc2626",
  CHIMNEY: "#9333ea",
  BUILDING: "#475569",
  WIND_TURBINE: "#0891b2",
  TOWER: "#ea580c",
};

const FEET_PER_METRE = 3.28084;

/** "150 m (492 ft)" */
export function formatObstacleHeight(metres: number | null): string {
  if (metres == null) return "—";
  return `${metres} m (${Math.round(metres * FEET_PER_METRE)} ft)`;
}

/** Altitude of the top in feet, as pilots read it: "1 024 ft" */
export function formatObstacleElevation(metres: number | null): string {
  if (metres == null) return "—";
  return `${Math.round(metres * FEET_PER_METRE).toLocaleString("fr-FR")} ft`;
}

/** "1,2 km · 0,6 NM" */
export function formatObstacleDistance(metres: number): string {
  const km = (metres / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const nm = (metres / 1852).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `${km} km · ${nm} NM`;
}
