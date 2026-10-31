/**
 * OurAirports (https://ourairports.com/data/, public domain) — matching and
 * normalisation for the links openAIP does not carry: the aerodrome's own
 * website and its Wikipedia article.
 *
 * openAIP never writes websiteUrl or wikipediaUrl, so the values set from
 * here survive the openAIP sync.
 */

export interface OurAirportsRow {
  ident: string;
  type: string;
  name: string;
  latitude: number;
  longitude: number;
  isoCountry: string;
  icaoCode: string | null;
  gpsCode: string | null;
  homeLink: string | null;
  wikipediaLink: string | null;
}

export interface AerodromeRef {
  id: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
}

export interface AerodromeLinks {
  websiteUrl: string | null;
  wikipediaUrl: string | null;
}

export type MatchMethod = "code" | "distance";

// France and its overseas territories, as OurAirports files them.
export const FRENCH_COUNTRIES = new Set([
  "FR", "GP", "MQ", "GF", "RE", "YT", "PM", "BL", "MF", "NC", "PF", "WF",
]);

// Beyond this, two points are not the same aerodrome.
const MAX_MATCH_DISTANCE_M = 1_000;
// A link shared by this many aerodromes is a federation or directory page.
const SHARED_LINK_THRESHOLD = 3;
const MAX_URL_LENGTH = 500;

// ─── CSV ───────────────────────────────────────────────────────────────────

/** RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(content: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const [header, ...rows] = records;
  if (!header) return [];
  return rows
    .filter((row) => row.length === header.length)
    .map((row) => Object.fromEntries(header.map((name, i) => [name, row[i]!])));
}

const blankToNull = (value: string | undefined) => value?.trim() || null;

/** airports.csv rows for France, without closed aerodromes. */
export function toOurAirportsRows(records: Record<string, string>[]): OurAirportsRow[] {
  const rows: OurAirportsRow[] = [];
  for (const r of records) {
    if (!FRENCH_COUNTRIES.has(r["iso_country"] ?? "") || r["type"] === "closed") continue;
    const latitude = Number(r["latitude_deg"]);
    const longitude = Number(r["longitude_deg"]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    rows.push({
      ident: r["ident"] ?? "",
      type: r["type"] ?? "",
      name: r["name"] ?? "",
      latitude,
      longitude,
      isoCountry: r["iso_country"]!,
      icaoCode: blankToNull(r["icao_code"])?.toUpperCase() ?? null,
      gpsCode: blankToNull(r["gps_code"])?.toUpperCase() ?? null,
      homeLink: blankToNull(r["home_link"]),
      wikipediaLink: blankToNull(r["wikipedia_link"]),
    });
  }
  return rows;
}

// ─── URLs ──────────────────────────────────────────────────────────────────

/** An http(s) URL, normalised, or null: these end up in an <a href>. */
export function safeUrl(value: string | null, allowedHost?: RegExp): string | null {
  if (!value || value.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (allowedHost && !allowedHost.test(url.hostname)) return null;
  // Wikipedia serves everything over https.
  if (allowedHost) url.protocol = "https:";
  return url.toString();
}

const WIKIPEDIA_HOST = /^[a-z-]+\.(?:m\.)?wikipedia\.org$/;

/** Links shared by several aerodromes: directory pages, not the aerodrome's own site. */
export function sharedLinks(rows: OurAirportsRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const url = safeUrl(row.homeLink);
    if (url) counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= SHARED_LINK_THRESHOLD).map(([url]) => url));
}

export function linksFor(row: OurAirportsRow, shared: Set<string>): AerodromeLinks {
  const website = safeUrl(row.homeLink);
  return {
    websiteUrl: website && !shared.has(website) ? website : null,
    wikipediaUrl: safeUrl(row.wikipediaLink, WIKIPEDIA_HOST),
  };
}

// ─── Matching ──────────────────────────────────────────────────────────────

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function codesOf(row: OurAirportsRow): string[] {
  const codes = [row.icaoCode, row.gpsCode, /^[A-Z]{4}$/.test(row.ident) ? row.ident : null];
  return [...new Set(codes.filter((c): c is string => !!c && /^[A-Z]{4}$/.test(c)))];
}

/**
 * Pairs OurAirports rows with our aerodromes. ICAO codes first; then, for
 * aerodromes without one (most ULM and private strips), position — but only
 * when each is the other's closest within 1 km, so that two neighbouring
 * strips never swap links.
 */
export function matchAerodromes(
  rows: OurAirportsRow[],
  aerodromes: AerodromeRef[],
): Map<string, { row: OurAirportsRow; method: MatchMethod }> {
  const matches = new Map<string, { row: OurAirportsRow; method: MatchMethod }>();
  const matchedRows = new Set<OurAirportsRow>();

  const byIcao = new Map(aerodromes.filter((a) => a.icaoCode).map((a) => [a.icaoCode!, a]));
  for (const row of rows) {
    for (const code of codesOf(row)) {
      const aerodrome = byIcao.get(code);
      if (aerodrome && !matches.has(aerodrome.id)) {
        matches.set(aerodrome.id, { row, method: "code" });
        matchedRows.add(row);
        break;
      }
    }
  }

  const freeAerodromes = aerodromes.filter((a) => !matches.has(a.id));
  const freeRows = rows.filter((r) => !matchedRows.has(r));

  const closest = <A, B>(from: A, candidates: B[], distance: (a: A, b: B) => number) => {
    let best: { item: B; d: number } | null = null;
    for (const item of candidates) {
      const d = distance(from, item);
      if (d <= MAX_MATCH_DISTANCE_M && (!best || d < best.d)) best = { item, d };
    }
    return best?.item ?? null;
  };
  const d = (a: AerodromeRef, r: OurAirportsRow) => distanceMeters(a.latitude, a.longitude, r.latitude, r.longitude);

  for (const aerodrome of freeAerodromes) {
    const row = closest(aerodrome, freeRows, d);
    if (!row) continue;
    const back = closest(row, freeAerodromes, (r: OurAirportsRow, a: AerodromeRef) => d(a, r));
    if (back === aerodrome) matches.set(aerodrome.id, { row, method: "distance" });
  }

  return matches;
}
