import type { PrismaClient } from "@aerodirectory/database";
import { createReadStream } from "node:fs";
import {
  access,
  constants as fsConstants,
  mkdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export interface OsmArtifacts {
  dataDir: string;
  rawPbf: string;
  filteredPbf: string;
  geojsonSeq: string;
  exportConfigPath: string;
}

type OsmCategory = "RESTAURANT" | "TRANSPORT" | "BIKE" | "ACCOMMODATION";

interface OsmPoiRow {
  osmId: string;
  lat: number;
  lon: number;
  category: OsmCategory;
  tags: Record<string, string>;
}

interface OsmImportStats {
  lines: number;
  upserted: number;
  skipped: number;
  errors: number;
  duplicatesCollapsed: number;
  firstError: string | null;
}

const GEOFABRIK_URL = "https://download.geofabrik.de/europe/france-latest.osm.pbf";
const OSMIUM_FILTER_TAGS = [
  "n/amenity=restaurant,cafe,bar,bicycle_rental",
  "n/highway=bus_stop",
  "n/railway=tram_stop,station,halt",
  "n/public_transport=platform,stop_position",
  "n/tourism=camp_site,caravan_site,hotel,motel,hostel,guest_house,chalet,apartment",
  "w/amenity=restaurant,cafe,bar,bicycle_rental",
  "w/public_transport=platform",
  "w/tourism=camp_site,caravan_site,hotel,motel,hostel,guest_house,chalet,apartment",
];
const BATCH_SIZE = 500;

async function pathExists(path: string) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureFile(path: string) {
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new Error(`Artefact invalide: ${path}`);
  }
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => {
      if (process.platform === "win32" && command === "osmium") {
        const fallback = spawn("wsl", [command, ...args], { stdio: "inherit" });
        fallback.on("error", reject);
        fallback.on("close", (code) => {
          if (code === 0) {
            resolvePromise();
          } else {
            reject(new Error(`wsl ${command} exited with status ${code ?? "unknown"}`));
          }
        });
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with status ${code ?? "unknown"}`));
      }
    });
  });
}

async function downloadFile(url: string, targetPath: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  const fileStream = createWriteStream(targetPath);
  await pipeline(Readable.fromWeb(response.body as globalThis.ReadableStream), fileStream);
}

const RESTAURANT_AMENITIES = new Set(["restaurant", "cafe", "bar"]);
const TRANSPORT_HIGHWAY = new Set(["bus_stop"]);
const TRANSPORT_RAILWAY = new Set(["tram_stop", "station", "halt"]);
const TRANSPORT_PT = new Set(["platform", "stop_position"]);
const ACCOMMODATION_TOURISM = new Set([
  "camp_site",
  "caravan_site",
  "hotel",
  "motel",
  "hostel",
  "guest_house",
  "chalet",
  "apartment",
]);

function classifyTags(props: Record<string, string>): OsmCategory | null {
  const amenity = props["amenity"];
  const highway = props["highway"];
  const railway = props["railway"];
  const publicTransport = props["public_transport"];
  const tourism = props["tourism"];

  if (amenity && RESTAURANT_AMENITIES.has(amenity)) return "RESTAURANT";
  if (amenity === "bicycle_rental") return "BIKE";
  if (highway && TRANSPORT_HIGHWAY.has(highway)) return "TRANSPORT";
  if (railway && TRANSPORT_RAILWAY.has(railway)) return "TRANSPORT";
  if (publicTransport && TRANSPORT_PT.has(publicTransport)) return "TRANSPORT";
  if (tourism && ACCOMMODATION_TOURISM.has(tourism)) return "ACCOMMODATION";

  return null;
}

function getCentroid(
  geometry: unknown,
): { lat: number; lon: number } | null {
  const geo = geometry as { type?: string; coordinates?: unknown };
  if (!geo?.type) return null;

  if (geo.type === "Point") {
    const [lon, lat] = geo.coordinates as [number, number];
    return typeof lat === "number" && typeof lon === "number" ? { lat, lon } : null;
  }

  if (geo.type === "Polygon") {
    const ring = (geo.coordinates as [number, number][][])?.[0];
    if (!ring?.length) return null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    for (const [lon, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }

    return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  }

  return null;
}

function parseGeoJsonSeqLine(rawLine: string): OsmPoiRow | null {
  const line = rawLine.replace(/^\x1e/, "").trim();
  if (!line) return null;

  let feature: { geometry?: unknown; properties?: Record<string, string> };
  try {
    feature = JSON.parse(line) as typeof feature;
  } catch {
    return null;
  }

  if (!feature.geometry || !feature.properties) return null;
  const properties = feature.properties;
  const osmType = properties["@type"];
  const osmId = properties["@id"];
  if (!osmType || !osmId) return null;

  const category = classifyTags(properties);
  if (!category) return null;

  const centroid = getCentroid(feature.geometry);
  if (!centroid) return null;

  return {
    osmId: `${osmType}/${osmId}`,
    lat: centroid.lat,
    lon: centroid.lon,
    category,
    tags: properties,
  };
}

async function upsertBatch(prisma: PrismaClient, rows: OsmPoiRow[]) {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let index = 1;

  for (const row of rows) {
    placeholders.push(
      `($${index++}, $${index++}, $${index++}, $${index++}, $${index++}::jsonb, NOW(), NOW())`,
    );
    values.push(row.osmId, row.lat, row.lon, row.category, JSON.stringify(row.tags));
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO osm.pois ("osmId", "lat", "lon", "category", "tags", "importedAt", "updatedAt")
     VALUES ${placeholders.join(", ")}
     ON CONFLICT ("osmId") DO UPDATE SET
       "lat" = EXCLUDED."lat",
       "lon" = EXCLUDED."lon",
       "category" = EXCLUDED."category",
       "tags" = EXCLUDED."tags",
       "updatedAt" = NOW()`,
    ...values,
  );
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function dedupeBatch(rows: OsmPoiRow[]) {
  const byOsmId = new Map<string, OsmPoiRow>();
  for (const row of rows) {
    byOsmId.set(row.osmId, row);
  }

  return {
    rows: Array.from(byOsmId.values()),
    collapsed: rows.length - byOsmId.size,
  };
}

async function flushBatch(
  prisma: PrismaClient,
  rows: OsmPoiRow[],
  stats: OsmImportStats,
) {
  if (rows.length === 0) return;

  const deduped = dedupeBatch(rows);
  stats.duplicatesCollapsed += deduped.collapsed;

  try {
    await upsertBatch(prisma, deduped.rows);
    stats.upserted += deduped.rows.length;
    return;
  } catch (error) {
    stats.firstError ??= normalizeErrorMessage(error);
  }

  for (const row of deduped.rows) {
    try {
      await upsertBatch(prisma, [row]);
      stats.upserted += 1;
    } catch (error) {
      stats.firstError ??= normalizeErrorMessage(error);
      stats.errors += 1;
    }
  }
}

export async function ensureOsmArtifacts(dataDir: string): Promise<OsmArtifacts> {
  const resolvedDir = resolve(dataDir);
  await mkdir(resolvedDir, { recursive: true });

  const exportConfigPath = join(resolvedDir, "osmium-export.json");
  await writeFile(
    exportConfigPath,
    JSON.stringify({ attributes: { id: true, type: true } }, null, 2),
    "utf-8",
  );

  return {
    dataDir: resolvedDir,
    rawPbf: join(resolvedDir, "france-latest.osm.pbf"),
    filteredPbf: join(resolvedDir, "france-poi.osm.pbf"),
    geojsonSeq: join(resolvedDir, "france-poi.geojsonseq"),
    exportConfigPath,
  };
}

export async function downloadFrancePbfIfMissing(artifacts: OsmArtifacts) {
  const exists = await pathExists(artifacts.rawPbf);
  if (!exists) {
    await downloadFile(GEOFABRIK_URL, artifacts.rawPbf);
  }
  await ensureFile(artifacts.rawPbf);
  return { downloaded: !exists, path: artifacts.rawPbf };
}

export async function filterOsmPbf(artifacts: OsmArtifacts) {
  await runCommand("osmium", [
    "tags-filter",
    artifacts.rawPbf,
    ...OSMIUM_FILTER_TAGS,
    "-o",
    artifacts.filteredPbf,
    "--overwrite",
    "--progress",
  ]);
  await ensureFile(artifacts.filteredPbf);
  return { path: artifacts.filteredPbf };
}

export async function exportOsmGeoJsonSeq(artifacts: OsmArtifacts) {
  await runCommand("osmium", [
    "export",
    artifacts.filteredPbf,
    "--output-format=geojsonseq",
    "--geometry-types=point,polygon",
    `--config=${artifacts.exportConfigPath}`,
    `--output=${artifacts.geojsonSeq}`,
    "--overwrite",
  ]);
  await ensureFile(artifacts.geojsonSeq);
  return { path: artifacts.geojsonSeq };
}

export async function importOsmGeoJsonSeq(
  prisma: PrismaClient,
  geojsonPath: string,
) {
  await ensureFile(geojsonPath);

  const stats: OsmImportStats = {
    lines: 0,
    upserted: 0,
    skipped: 0,
    errors: 0,
    duplicatesCollapsed: 0,
    firstError: null,
  };
  let batch: OsmPoiRow[] = [];

  const lineReader = createInterface({
    input: createReadStream(geojsonPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const rawLine of lineReader) {
    stats.lines++;
    const row = parseGeoJsonSeqLine(rawLine);
    if (!row) {
      stats.skipped++;
      continue;
    }

    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(prisma, batch, stats);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await flushBatch(prisma, batch, stats);
  }

  return stats;
}
