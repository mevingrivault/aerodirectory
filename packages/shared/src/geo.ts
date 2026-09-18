/** Great-circle distances (haversine). One implementation for the whole app. */

export const EARTH_RADIUS_KM = 6371;
export const EARTH_RADIUS_NM = 3440.065;
export const EARTH_RADIUS_M = 6_371_000;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number, radius: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversine(lat1, lon1, lat2, lon2, EARTH_RADIUS_KM);
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversine(lat1, lon1, lat2, lon2, EARTH_RADIUS_NM);
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversine(lat1, lon1, lat2, lon2, EARTH_RADIUS_M);
}
