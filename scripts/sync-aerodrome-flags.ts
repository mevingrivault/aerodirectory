#!/usr/bin/env tsx

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@aerodirectory/database";
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
    console.log("\n[sync:flags] Calcul des flags depuis osm.pois...");
    const result = await runSyncAerodromeFlagsTask(prisma);

    if (result.skipped) {
      console.warn("  La table osm.pois est vide. Lancez d'abord `pnpm import:osm`.");
      return;
    }

    console.log("\n=== Résumé sync:flags ===");
    console.log(`  POI total        : ${result.totalPois}`);
    console.log(`  Aérodromes maj   : ${result.updated}`);
    console.log(`  hasRestaurant    : ${result.byFlag.hasRestaurant}`);
    console.log(`  hasBikes         : ${result.byFlag.hasBikes}`);
    console.log(`  hasTransport     : ${result.byFlag.hasTransport}`);
    console.log(`  hasAccommodation : ${result.byFlag.hasAccommodation}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
