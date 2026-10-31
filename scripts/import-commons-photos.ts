#!/usr/bin/env tsx

import { PrismaClient } from "@aerodirectory/database";
import type { ConfigService } from "@nestjs/config";
import { StorageService } from "../apps/api/src/photo/storage.service";
import { wikimediaApi } from "../apps/api/src/services/importers/wikimedia/wikimedia.client";
import { syncCommonsPhotos } from "../apps/api/src/services/importers/wikimedia/wikimedia.importer";

// StorageService reads its S3 settings through ConfigService; the script
// has no Nest container, so it hands it the environment directly.
const envConfig = {
  get: <T>(key: string, fallback?: T) => (process.env[key] as T | undefined) ?? fallback,
} as unknown as ConfigService;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const prisma = new PrismaClient();
  await prisma.$connect();
  const storage = new StorageService(envConfig);
  if (!dryRun) await storage.onModuleInit();

  try {
    const result = await syncCommonsPhotos(prisma, wikimediaApi, storage, {
      dryRun,
      log: (line) => console.log(line),
    });
    console.log("\n=== Commons photos ===");
    console.log(`  Aerodromes:              ${result.aerodromes}`);
    console.log(`  Linked by ICAO code:     ${result.linkedByIcao}`);
    console.log(`  Linked by Wikipedia:     ${result.linkedByWikipedia}`);
    console.log(`  Licence accepted:        ${result.accepted}`);
    console.log(`  ${dryRun ? "To download" : "Downloaded"}:${dryRun ? "             " : "              "}${result.downloaded}`);
    console.log(`  Credit updated:          ${result.metadataUpdated}`);
    console.log(`  Unchanged:               ${result.unchanged}`);
    console.log(`  ${dryRun ? "To remove" : "Removed"}:${dryRun ? "               " : "                 "}${result.removed}`);
    console.log(`  Rejected:`);
    for (const [reason, count] of Object.entries(result.rejected).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count.toString().padStart(4)}  ${reason}`);
    }
    console.log(`  Errors:                  ${result.errors.length}`);
    console.log("======================\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
