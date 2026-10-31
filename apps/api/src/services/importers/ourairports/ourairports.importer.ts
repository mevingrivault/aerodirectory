/**
 * OurAirports importer — fills websiteUrl and wikipediaUrl on imported
 * aerodromes from the OurAirports airports.csv.
 *
 * Idempotent: only rows whose links changed are written. Hand-made sheets
 * (source "manual") are left alone, their links belong to the admins.
 */

import type { PrismaClient } from "@aerodirectory/database";
import {
  linksFor,
  matchAerodromes,
  parseCsv,
  sharedLinks,
  toOurAirportsRows,
} from "./ourairports.normalizer";

export const OURAIRPORTS_AIRPORTS_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";
// ~12 MB; GitHub Pages can be slow.
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export async function downloadOurAirportsCsv(): Promise<string> {
  const res = await fetch(OURAIRPORTS_AIRPORTS_URL, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OurAirports download failed: HTTP ${res.status}`);
  return res.text();
}

export interface OurAirportsImportResult {
  rows: number;
  aerodromes: number;
  matchedByCode: number;
  matchedByDistance: number;
  withWebsite: number;
  withWikipedia: number;
  updated: number;
  dryRun: boolean;
}

export async function syncOurAirportsLinks(
  prisma: PrismaClient,
  csv: string,
  options: { dryRun?: boolean } = {},
): Promise<OurAirportsImportResult> {
  const dryRun = options.dryRun ?? false;
  const rows = toOurAirportsRows(parseCsv(csv));
  const shared = sharedLinks(rows);

  const aerodromes = await prisma.aerodrome.findMany({
    where: { source: { not: null }, NOT: { source: "manual" } },
    select: { id: true, icaoCode: true, latitude: true, longitude: true, websiteUrl: true, wikipediaUrl: true },
  });
  const current = new Map(aerodromes.map((a) => [a.id, a]));
  const matches = matchAerodromes(rows, aerodromes);

  const result: OurAirportsImportResult = {
    rows: rows.length,
    aerodromes: aerodromes.length,
    matchedByCode: 0,
    matchedByDistance: 0,
    withWebsite: 0,
    withWikipedia: 0,
    updated: 0,
    dryRun,
  };

  for (const [aerodromeId, { row, method }] of matches) {
    if (method === "code") result.matchedByCode++;
    else result.matchedByDistance++;

    const links = linksFor(row, shared);
    if (links.websiteUrl) result.withWebsite++;
    if (links.wikipediaUrl) result.withWikipedia++;

    const before = current.get(aerodromeId)!;
    if (before.websiteUrl === links.websiteUrl && before.wikipediaUrl === links.wikipediaUrl) continue;

    result.updated++;
    if (!dryRun) {
      await prisma.aerodrome.update({ where: { id: aerodromeId }, data: links });
    }
  }

  return result;
}
