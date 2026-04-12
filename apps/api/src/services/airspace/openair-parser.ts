/**
 * OpenAir parser (MVP): supports AC/AN/AL/AH/DP directives.
 *
 * Notes:
 * - Coordinates are exported as GeoJSON Polygon ([lng, lat]).
 * - Circles/arcs (DC/DA/DB/V) are currently skipped and reported as errors.
 */

export interface ParsedAirspace {
  name: string;
  class: string;
  lowerLimit: string;
  upperLimit: string;
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
}

export interface OpenAirParseResult {
  airspaces: ParsedAirspace[];
  errors: string[];
}

interface WorkingAirspace {
  name: string;
  class: string;
  lowerLimit: string;
  upperLimit: string;
  points: Array<{ lat: number; lon: number }>;
}

const DEFAULT_NAME = "Unnamed airspace";
const DEFAULT_CLASS = "UNKNOWN";
const DEFAULT_LOWER = "SFC";
const DEFAULT_UPPER = "UNL";

export function parseOpenAirFile(content: string): OpenAirParseResult {
  const lines = content.split(/\r?\n/);
  const errors: string[] = [];
  const airspaces: ParsedAirspace[] = [];

  let current: WorkingAirspace | null = null;

  const flushCurrent = (lineNo: number) => {
    if (!current) return;

    if (current.points.length < 3) {
      errors.push(
        `[line ${lineNo}] Airspace "${current.name}" ignored: at least 3 DP points required.`,
      );
      current = null;
      return;
    }

    const coordinates = current.points.map((p) => [p.lon, p.lat] as [number, number]);
    const first = coordinates[0]!;
    const last = coordinates[coordinates.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coordinates.push([first[0], first[1]]);
    }

    airspaces.push({
      name: current.name,
      class: current.class,
      lowerLimit: current.lowerLimit,
      upperLimit: current.upperLimit,
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
    });

    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith(";")) {
      continue;
    }

    const directive = trimmed.slice(0, 2).toUpperCase();
    const value = trimmed.length > 2 ? trimmed.slice(2).trim() : "";

    if (directive === "AC") {
      flushCurrent(lineNo);
      current = {
        name: DEFAULT_NAME,
        class: value || DEFAULT_CLASS,
        lowerLimit: DEFAULT_LOWER,
        upperLimit: DEFAULT_UPPER,
        points: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (directive === "AN") {
      current.name = value || DEFAULT_NAME;
      continue;
    }

    if (directive === "AL") {
      current.lowerLimit = value || DEFAULT_LOWER;
      continue;
    }

    if (directive === "AH") {
      current.upperLimit = value || DEFAULT_UPPER;
      continue;
    }

    if (directive === "DP") {
      try {
        const { lat, lon } = parseOpenAirLatLon(value);
        current.points.push({ lat, lon });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid DP coordinate";
        errors.push(`[line ${lineNo}] ${message}`);
      }
      continue;
    }

    if (["DC", "DA", "DB", "V ", "V="].includes(directive)) {
      errors.push(
        `[line ${lineNo}] Directive ${directive.trim()} not supported yet and was ignored.`,
      );
      continue;
    }
  }

  flushCurrent(lines.length);
  return { airspaces, errors };
}

export function parseOpenAirLatitude(lat: string): number {
  return parseOpenAirCoordinate(lat, "lat");
}

export function parseOpenAirLongitude(lon: string): number {
  return parseOpenAirCoordinate(lon, "lon");
}

function parseOpenAirLatLon(value: string): { lat: number; lon: number } {
  const match = value.match(
    /^(.+?\b[NS])\s+(.+?\b[EW])$/i,
  );

  if (!match) {
    throw new Error(`Invalid DP format: "${value}"`);
  }

  return {
    lat: parseOpenAirLatitude(match[1]!.trim()),
    lon: parseOpenAirLongitude(match[2]!.trim()),
  };
}

function parseOpenAirCoordinate(input: string, axis: "lat" | "lon"): number {
  const normalized = input
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  const hemisphereMatch = normalized.match(/([NSEW])$/i);
  if (!hemisphereMatch) {
    throw new Error(`Missing hemisphere in coordinate: "${input}"`);
  }

  const hemisphere = hemisphereMatch[1]!.toUpperCase();
  const numericPart = normalized.slice(0, normalized.length - 1).trim();

  const sign = hemisphere === "S" || hemisphere === "W" ? -1 : 1;
  const isLat = axis === "lat";

  if ((isLat && !["N", "S"].includes(hemisphere)) || (!isLat && !["E", "W"].includes(hemisphere))) {
    throw new Error(`Invalid hemisphere for ${axis}: "${input}"`);
  }

  const chunks = numericPart.split(":").map((part) => part.trim());
  if (chunks.length < 2 || chunks.length > 3) {
    throw new Error(`Invalid coordinate format: "${input}"`);
  }

  const deg = Number(chunks[0]);
  const min = Number(chunks[1]);
  const sec = chunks.length === 3 ? Number(chunks[2]) : 0;

  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) {
    throw new Error(`Invalid numeric coordinate: "${input}"`);
  }
  if (min < 0 || min >= 60 || sec < 0 || sec >= 60) {
    throw new Error(`Invalid minutes/seconds in coordinate: "${input}"`);
  }

  const maxDeg = isLat ? 90 : 180;
  if (deg < 0 || deg > maxDeg) {
    throw new Error(`Invalid degree range in coordinate: "${input}"`);
  }

  const decimal = deg + min / 60 + sec / 3600;
  return sign * decimal;
}
