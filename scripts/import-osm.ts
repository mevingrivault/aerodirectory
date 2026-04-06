#!/usr/bin/env tsx

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@aerodirectory/database";
import {
  ensureOsmArtifacts,
  downloadFrancePbfIfMissing,
  exportOsmGeoJsonSeq,
  filterOsmPbf,
  importOsmGeoJsonSeq,
} from "../apps/api/src/sync/tasks/osm-sync.task";
import { runSyncAerodromeFlagsTask } from "../apps/api/src/sync/tasks/flags-sync.task";

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

async function main() {
  loadEnv();

  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    const dataDir = process.env["SYNC_DATA_DIR"] || resolve(process.cwd(), "data");
    const artifacts = await ensureOsmArtifacts(dataDir);

    console.log("\n[OSM] Préparation des artefacts...");
    const download = await downloadFrancePbfIfMissing(artifacts);
    console.log(
      download.downloaded
        ? `[OSM] PBF téléchargé dans ${download.path}`
        : `[OSM] PBF déjà présent dans ${download.path}`,
    );

    console.log("[OSM] Filtrage des POI...");
    await filterOsmPbf(artifacts);

    console.log("[OSM] Export GeoJSON sequence...");
    await exportOsmGeoJsonSeq(artifacts);

    console.log("[OSM] Import en base...");
    const importStats = await importOsmGeoJsonSeq(prisma, artifacts.geojsonSeq);

    console.log("[OSM] Recalcul des flags aérodromes...");
    const flagsStats = await runSyncAerodromeFlagsTask(prisma);

    console.log("\n=== Résumé import OSM ===");
    console.log(`  Lignes lues     : ${importStats.lines}`);
    console.log(`  POI importés    : ${importStats.upserted}`);
    console.log(`  Ignorés         : ${importStats.skipped}`);
    console.log(`  Erreurs import  : ${importStats.errors}`);
    console.log(`  Flags mis à jour: ${flagsStats.updated}`);
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
