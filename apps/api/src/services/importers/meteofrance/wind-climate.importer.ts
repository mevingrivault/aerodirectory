/**
 * Wind climatology importer — streams the Météo-France hourly files of one
 * multi-year period (one gzipped CSV per department, ~2.5 GB in all),
 * aggregates the wind per station and replaces the `wind_climate` table.
 */

import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@aerodirectory/database";
import { addObservation, headerIndex, representative, type StationAccumulator } from "./wind-climate";

const DATASET_URL = "https://www.data.gouv.fr/api/1/datasets/donnees-climatologiques-de-base-horaires/";
const FILE_HOST = "meteofrance.s3.sbg.io.cloud.ovh.net";
// The closed multi-year file; the "latest" one is still being filled.
const PERIOD = { label: "previous-2020-2024", firstYear: 2020, lastYear: 2024 };
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const INSERT_BATCH = 200;
const TRANSACTION_TIMEOUT_MS = 5 * 60_000;
// Far fewer means a broken download, not fewer stations.
const MIN_EXPECTED_STATIONS = 300;

const DatasetSchema = z.object({ resources: z.array(z.object({ url: z.string() })) });

export type FetchStream = (url: string) => Promise<Readable>;

const fetchStream: FetchStream = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`Météo-France ${url}: HTTP ${res.status}`);
  return Readable.fromWeb(res.body as globalThis.ReadableStream);
};

/** URLs of the period's department files, from the data.gouv.fr dataset. */
export async function listPeriodFiles(fetchJson: (url: string) => Promise<unknown> = defaultFetchJson): Promise<string[]> {
  const { resources } = DatasetSchema.parse(await fetchJson(DATASET_URL));
  return resources
    .map((r) => r.url)
    .filter((url) => {
      try {
        const { hostname, pathname } = new URL(url);
        return hostname === FILE_HOST && new RegExp(`/H_[0-9AB]+_${PERIOD.label}\\.csv\\.gz$`).test(pathname);
      } catch {
        return false;
      }
    })
    .sort();
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`data.gouv.fr: HTTP ${res.status}`);
  return res.json();
}

/** Aggregates one gzipped department file into `stations`. */
export async function aggregateFile(stream: Readable, stations: Map<string, StationAccumulator>): Promise<number> {
  const lines = createInterface({ input: stream.pipe(createGunzip()), crlfDelay: Infinity });
  let index: ReturnType<typeof headerIndex> | null = null;
  let count = 0;
  for await (const line of lines) {
    if (!index) {
      index = headerIndex(line);
      continue;
    }
    if (line) {
      addObservation(stations, index, line);
      count++;
    }
  }
  return count;
}

export interface WindClimateImportResult {
  files: number;
  lines: number;
  stations: number;
  imported: number;
  failedFiles: string[];
}

export async function syncWindClimate(
  prisma: PrismaClient,
  options: {
    files?: string[];
    fetch?: FetchStream;
    log?: (line: string) => void;
    /** Safety floor on the number of stations; lower it only for a partial run. */
    minStations?: number;
  } = {},
): Promise<WindClimateImportResult> {
  const log = options.log ?? (() => undefined);
  const files = options.files ?? (await listPeriodFiles());
  const open = options.fetch ?? fetchStream;

  const stations = new Map<string, StationAccumulator>();
  let lines = 0;
  const failedFiles: string[] = [];
  for (const [i, url] of files.entries()) {
    try {
      lines += await aggregateFile(await open(url), stations);
      log(`Météo-France ${i + 1}/${files.length} : ${url.split("/").pop()} (${stations.size} stations)`);
    } catch (error) {
      failedFiles.push(url);
      log(`Météo-France ${url} : ${(error as Error).message}`);
    }
  }

  // A missing department would drop its stations until next year's run: retry instead.
  if (failedFiles.length > 0) {
    throw new Error(`${failedFiles.length} fichier(s) Météo-France en échec ; données existantes conservées.`);
  }

  const years = PERIOD.lastYear - PERIOD.firstYear + 1;
  const rows = [...stations.values()].filter((s) => representative(s, years));
  if (rows.length < (options.minStations ?? MIN_EXPECTED_STATIONS)) {
    throw new Error(`Seulement ${rows.length} stations exploitables ; données existantes conservées.`);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.windClimate.deleteMany({});
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await tx.windClimate.createMany({
          data: rows.slice(i, i + INSERT_BATCH).map((s) => ({
            stationId: s.stationId,
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
            altitudeM: s.altitudeM,
            periodStart: s.firstYear,
            periodEnd: s.lastYear,
            observations: s.observations,
            calm: s.calm,
            counts: s.counts as unknown as Prisma.InputJsonValue,
          })),
        });
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );

  return { files: files.length, lines, stations: stations.size, imported: rows.length, failedFiles };
}
