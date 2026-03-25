#!/usr/bin/env tsx

/**
 * Import OSM points of interest into the local `osm.pois` table.
 *
 * Usage:
 *   pnpm import:osm [path/to/export.geojsonseq]
 *
 * If no file is provided (or the file is missing), the script will automatically:
 *   1. Download france-latest.osm.pbf from Geofabrik (~4 GB)
 *   2. Filter relevant tags with osmium
 *   3. Export to GeoJSON sequence
 *   4. Import into the database
 *
 * Requires osmium-tool in PATH for the automatic pipeline.
 * Install: https://osmcode.org/osmium-tool/
 *   Linux/WSL : sudo apt install osmium-tool
 *   macOS     : brew install osmium-tool
 *   Windows   : via OSGeo4W or conda install -c conda-forge osmium-tool
 */

import { createReadStream, existsSync, mkdirSync, readFileSync } from "fs";
import { createInterface } from "readline";
import { join, resolve } from "path";
import { execSync, spawnSync } from "child_process";

// ─── Env loader (same as import-openaip.ts) ─────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  let content: string;
  const raw = readFileSync(envPath);
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    content = raw.toString("utf16le").replace(/^\uFEFF/, "");
  } else {
    content = raw.toString("utf-8").replace(/^\uFEFF/, "");
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

// ─── OSM pipeline constants ──────────────────────────────────────────────────

const DATA_DIR = resolve(process.cwd(), "data");
const PBF_RAW = join(DATA_DIR, "france-latest.osm.pbf");
const PBF_FILTERED = join(DATA_DIR, "france-poi.osm.pbf");
const GEOJSONSEQ_DEFAULT = join(DATA_DIR, "france-poi.geojsonseq");

const GEOFABRIK_URL =
  "https://download.geofabrik.de/europe/france-latest.osm.pbf";

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

// ─── OSM pipeline helpers ────────────────────────────────────────────────────

function checkCommand(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Convert a Windows absolute path to its WSL /mnt/… equivalent. */
function toWslPath(p: string): string {
  return p
    .replace(/^([A-Za-z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`)
    .replace(/\\/g, "/");
}

/**
 * Run an osmium command.
 * Tries native `osmium` first; falls back to `wsl osmium` on Windows,
 * converting absolute Windows paths to WSL paths automatically.
 */
function runOsmium(args: string[]): void {
  if (checkCommand("osmium")) {
    const r = spawnSync("osmium", args, { stdio: "inherit" });
    if (r.status !== 0) throw new Error("osmium échoué");
    return;
  }

  if (!checkCommand("wsl")) {
    throw new Error(
      "osmium-tool introuvable (ni en natif ni via WSL).\n" +
      "  WSL  : sudo apt install osmium-tool\n" +
      "  macOS: brew install osmium-tool",
    );
  }

  // Convert Windows absolute paths → WSL paths in every arg
  const wslArgs = args.map((arg) => {
    if (/^[A-Za-z]:\\/.test(arg)) return toWslPath(arg);
    for (const prefix of ["--output=", "--config="]) {
      if (arg.startsWith(prefix) && /^[A-Za-z]:\\/.test(arg.slice(prefix.length))) {
        return `${prefix}${toWslPath(arg.slice(prefix.length))}`;
      }
    }
    return arg;
  });

  const r = spawnSync("wsl", ["osmium", ...wslArgs], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("wsl osmium échoué");
}

function downloadPbf(): void {
  console.log(`\n[OSM] Téléchargement de france-latest.osm.pbf (~4 Go)...`);
  console.log(`      Source : ${GEOFABRIK_URL}`);
  // curl is available on Windows 10+ natively; fall back to wsl curl
  const useCurl = checkCommand("curl");
  const [bin, binArgs]: [string, string[]] = useCurl
    ? ["curl", ["-L", "--progress-bar", GEOFABRIK_URL, "-o", PBF_RAW]]
    : ["wsl", ["curl", "-L", "--progress-bar", GEOFABRIK_URL, "-o", toWslPath(PBF_RAW)]];
  const r = spawnSync(bin, binArgs, { stdio: "inherit" });
  if (r.status !== 0) throw new Error("Téléchargement échoué");
}

function filterPbf(): void {
  console.log(`\n[OSM] Filtrage osmium → ${PBF_FILTERED}`);
  runOsmium([
    "tags-filter", PBF_RAW,
    ...OSMIUM_FILTER_TAGS,
    "-o", PBF_FILTERED,
    "--overwrite", "--progress",
  ]);
}

function exportGeojsonseq(outputPath: string): void {
  console.log(`\n[OSM] Export GeoJSON sequence → ${outputPath}`);
  const configPath = resolve(process.cwd(), "scripts", "osmium-export.json");
  runOsmium([
    "export", PBF_FILTERED,
    "--output-format=geojsonseq",
    "--geometry-types=point,polygon",
    `--config=${configPath}`,
    `--output=${outputPath}`,
    "--overwrite",
  ]);
}

import { PrismaClient } from "@aerodirectory/database";

// ─── Types ───────────────────────────────────────────────────────────────────

type OsmCategory = "RESTAURANT" | "TRANSPORT" | "BIKE" | "ACCOMMODATION";

interface OsmPoiRow {
  osmId: string;
  lat: number;
  lon: number;
  category: OsmCategory;
  tags: Record<string, string>;
}

// ─── Classification ──────────────────────────────────────────────────────────

const RESTAURANT_AMENITIES = new Set(["restaurant", "cafe", "bar"]);
const TRANSPORT_HIGHWAY = new Set(["bus_stop"]);
const TRANSPORT_RAILWAY = new Set(["tram_stop", "station", "halt"]);
const TRANSPORT_PT = new Set(["platform", "stop_position"]);
const ACCOMMODATION_TOURISM = new Set([
  "camp_site", "caravan_site",
  "hotel", "motel", "hostel",
  "guest_house", "chalet", "apartment",
]);

function classifyTags(props: Record<string, string>): OsmCategory | null {
  const amenity = props["amenity"];
  const highway = props["highway"];
  const railway = props["railway"];
  const pt = props["public_transport"];
  const tourism = props["tourism"];

  if (amenity && RESTAURANT_AMENITIES.has(amenity)) return "RESTAURANT";
  if (amenity === "bicycle_rental") return "BIKE";
  if (highway && TRANSPORT_HIGHWAY.has(highway)) return "TRANSPORT";
  if (railway && TRANSPORT_RAILWAY.has(railway)) return "TRANSPORT";
  if (pt && TRANSPORT_PT.has(pt)) return "TRANSPORT";
  if (tourism && ACCOMMODATION_TOURISM.has(tourism)) return "ACCOMMODATION";

  return null;
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function getCentroid(
  geometry: unknown,
): { lat: number; lon: number } | null {
  const g = geometry as { type: string; coordinates: unknown };
  if (!g || !g.type) return null;

  if (g.type === "Point") {
    const [lon, lat] = g.coordinates as [number, number];
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    return { lat, lon };
  }

  if (g.type === "Polygon") {
    const ring = (g.coordinates as [number, number][][])[0];
    if (!ring || ring.length === 0) return null;
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
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

// ─── Line parser ─────────────────────────────────────────────────────────────
// osmium export --output-format=geojsonseq prepends \x1e (ASCII RS) to each line

function parseLine(rawLine: string): OsmPoiRow | null {
  const line = rawLine.replace(/^\x1e/, "").trim();
  if (!line) return null;

  let feature: {
    geometry?: unknown;
    properties?: Record<string, string>;
  };
  try {
    feature = JSON.parse(line) as typeof feature;
  } catch {
    return null;
  }

  if (!feature.geometry || !feature.properties) return null;

  const props = feature.properties;
  // osmium adds @id (numeric) and @type (node/way/relation) when the export config enables them
  const osmType = props["@type"];
  const osmIdNum = props["@id"];
  if (!osmType || !osmIdNum) return null;
  const osmId = `${osmType}/${osmIdNum}`; // e.g. "node/123456"

  const category = classifyTags(props);
  if (!category) return null;

  const centroid = getCentroid(feature.geometry);
  if (!centroid) return null;

  return {
    osmId,
    lat: centroid.lat,
    lon: centroid.lon,
    category,
    tags: props,
  };
}

// ─── Batch upsert ────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function upsertBatch(
  prisma: PrismaClient,
  rows: OsmPoiRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const row of rows) {
    placeholders.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}::jsonb, NOW(), NOW())`,
    );
    values.push(row.osmId, row.lat, row.lon, row.category, JSON.stringify(row.tags));
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO osm.pois ("osmId", "lat", "lon", "category", "tags", "importedAt", "updatedAt")
     VALUES ${placeholders.join(", ")}
     ON CONFLICT ("osmId") DO UPDATE SET
       "lat"        = EXCLUDED."lat",
       "lon"        = EXCLUDED."lon",
       "category"   = EXCLUDED."category",
       "tags"       = EXCLUDED."tags",
       "updatedAt"  = NOW()`,
    ...values,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  let filePath = process.argv[2] ?? GEOJSONSEQ_DEFAULT;
  filePath = resolve(filePath);

  if (!existsSync(filePath)) {
    console.log(`\n[OSM] Fichier introuvable : ${filePath}`);
    console.log(`[OSM] Lancement du pipeline automatique (download → filter → export)...`);

    const hasOsmium = checkCommand("osmium") || checkCommand("wsl");
    if (!hasOsmium) {
      console.error(
        "\n[OSM] ✗ osmium-tool introuvable (ni en natif ni via WSL).\n" +
        "  WSL/Linux : sudo apt install osmium-tool\n" +
        "  macOS     : brew install osmium-tool\n" +
        "\nOu fournissez un fichier .geojsonseq existant :\n" +
        "  pnpm import:osm path/to/france-poi.geojsonseq",
      );
      process.exit(1);
    }

    mkdirSync(DATA_DIR, { recursive: true });

    if (existsSync(PBF_RAW)) {
      console.log(`[OSM] france-latest.osm.pbf déjà présent — skip téléchargement.`);
    } else {
      downloadPbf();
    }

    filterPbf();
    exportGeojsonseq(filePath);
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log(`\n[OSM] Import depuis ${filePath}`);

  const stats = { lines: 0, upserted: 0, skipped: 0, errors: 0 };
  let batch: OsmPoiRow[] = [];

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const rawLine of rl) {
    stats.lines++;
    const row = parseLine(rawLine);
    if (!row) { stats.skipped++; continue; }

    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      try {
        await upsertBatch(prisma, batch);
        stats.upserted += batch.length;
      } catch (err) {
        console.error(`  Erreur batch : ${err}`);
        stats.errors += batch.length;
      }
      batch = [];

      if (stats.upserted % 50_000 === 0) {
        console.log(`  ${stats.upserted.toLocaleString()} POI importés...`);
      }
    }
  }

  if (batch.length > 0) {
    try {
      await upsertBatch(prisma, batch);
      stats.upserted += batch.length;
    } catch (err) {
      console.error(`  Erreur dernier batch : ${err}`);
      stats.errors += batch.length;
    }
  }

  console.log("\n=== Résumé import OSM ===");
  console.log(`  Lignes lues  : ${stats.lines.toLocaleString()}`);
  console.log(`  POI importés : ${stats.upserted.toLocaleString()}`);
  console.log(`  Ignorés      : ${stats.skipped.toLocaleString()}`);
  console.log(`  Erreurs      : ${stats.errors}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
