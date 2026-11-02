/**
 * Prevailing-wind climatology from Météo-France hourly data ("Données
 * climatologiques de base - horaires", Licence Ouverte): per station, how
 * often the wind blew from each 10° direction, in three speed classes.
 */

export const DIRECTIONS = 36; // 0°, 10°, … 350°
export const SPEED_CLASSES = 3; // 1–10 kt, 11–20 kt, > 20 kt

const KT_PER_MS = 1.943844;
const CALM_KT = 1;
// Quality code 2 means "doubtful, being checked".
const DOUBTFUL = "2";

export interface StationAccumulator {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  altitudeM: number | null;
  firstYear: number;
  lastYear: number;
  observations: number;
  calm: number;
  counts: number[][]; // [direction][speed class]
}

export interface HeaderIndex {
  station: number;
  name: number;
  lat: number;
  lon: number;
  alt: number;
  time: number;
  ff: number;
  qff: number;
  dd: number;
  qdd: number;
}

export function headerIndex(headerLine: string): HeaderIndex {
  const columns = headerLine.trim().split(";");
  const at = (name: string) => {
    const i = columns.indexOf(name);
    if (i === -1) throw new Error(`Colonne ${name} absente du fichier Météo-France`);
    return i;
  };
  return {
    station: at("NUM_POSTE"),
    name: at("NOM_USUEL"),
    lat: at("LAT"),
    lon: at("LON"),
    alt: at("ALTI"),
    time: at("AAAAMMJJHH"),
    ff: at("FF"),
    qff: at("QFF"),
    dd: at("DD"),
    qdd: at("QDD"),
  };
}

export function speedClass(knots: number): number {
  if (knots <= 10) return 0;
  if (knots <= 20) return 1;
  return 2;
}

/** 10° bin of a direction in degrees: 355 → 0 (north), 5 → 0, 15 → 1… */
export function directionBin(degrees: number): number {
  return Math.round((((degrees % 360) + 360) % 360) / 10) % DIRECTIONS;
}

/** Adds one CSV line to its station's totals; lines without a valid wind are skipped. */
export function addObservation(stations: Map<string, StationAccumulator>, index: HeaderIndex, line: string): void {
  const f = line.split(";");
  const ffRaw = f[index.ff];
  const ddRaw = f[index.dd];
  if (!ffRaw || !ddRaw || f[index.qff] === DOUBTFUL || f[index.qdd] === DOUBTFUL) return;
  const ff = Number(ffRaw);
  const dd = Number(ddRaw);
  if (!Number.isFinite(ff) || !Number.isFinite(dd) || ff < 0 || dd < 0 || dd > 360) return;

  const id = f[index.station]!;
  let station = stations.get(id);
  const year = Number(f[index.time]!.slice(0, 4));
  if (!station) {
    const lat = Number(f[index.lat]);
    const lon = Number(f[index.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const alt = Number(f[index.alt]);
    station = {
      stationId: id,
      name: (f[index.name] ?? id).trim(),
      latitude: lat,
      longitude: lon,
      altitudeM: Number.isFinite(alt) && f[index.alt] !== "" ? Math.round(alt) : null,
      firstYear: year,
      lastYear: year,
      observations: 0,
      calm: 0,
      counts: Array.from({ length: DIRECTIONS }, () => new Array<number>(SPEED_CLASSES).fill(0)),
    };
    stations.set(id, station);
  }

  station.observations++;
  if (year < station.firstYear) station.firstYear = year;
  if (year > station.lastYear) station.lastYear = year;
  const knots = ff * KT_PER_MS;
  // DD 0 is how calm is coded; a light wind has no meaningful direction either.
  if (knots < CALM_KT || dd === 0) {
    station.calm++;
    return;
  }
  station.counts[directionBin(dd)]![speedClass(knots)]!++;
}

/** Stations with enough hours to describe a climate: here, 70% of the period. */
export function representative(station: StationAccumulator, years: number): boolean {
  return station.observations >= years * 365 * 24 * 0.7;
}
