/** Power line or aerial ropeway near an aerodrome, as GET /aerodromes/:id/aerial-lines returns it. */
export interface NearbyAerialLine {
  id: string;
  kind: "POWER_LINE" | "CABLE";
  detail: string | null;
  name: string | null;
  geometry: GeoJSON.LineString;
  distanceM: number;
  bearingDeg: number;
}

export const AERIAL_LINE_LABELS: Record<NearbyAerialLine["kind"], string> = {
  POWER_LINE: "Ligne électrique",
  CABLE: "Câble / remontée",
};

export const AERIAL_LINE_COLORS: Record<NearbyAerialLine["kind"], string> = {
  POWER_LINE: "#dc2626",
  CABLE: "#7e22ce",
};

/** "Ligne électrique 225 kV", "Télésiège · Saulire" */
export function aerialLineTitle(line: NearbyAerialLine): string {
  if (line.kind === "POWER_LINE") return line.detail ? `${AERIAL_LINE_LABELS.POWER_LINE} ${line.detail}` : AERIAL_LINE_LABELS.POWER_LINE;
  return [line.detail ?? AERIAL_LINE_LABELS.CABLE, line.name].filter(Boolean).join(" · ");
}
