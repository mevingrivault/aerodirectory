#!/usr/bin/env tsx

import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@aerodirectory/database";
import {
  OURAIRPORTS_AIRPORTS_URL,
  downloadOurAirportsCsv,
  syncOurAirportsLinks,
} from "../apps/api/src/services/importers/ourairports/ourairports.importer";

async function loadCsv(fileArg: string | undefined): Promise<string> {
  if (fileArg) return readFileSync(resolve(process.cwd(), fileArg), "utf8");

  console.log(`Downloading ${OURAIRPORTS_AIRPORTS_URL}...`);
  return downloadOurAirportsCsv();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((a) => !a.startsWith("--"));

  const csv = await loadCsv(fileArg);

  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    const result = await syncOurAirportsLinks(prisma, csv, { dryRun });
    console.log("\n=== OurAirports links ===");
    console.log(`  OurAirports rows (FR):  ${result.rows}`);
    console.log(`  Imported aerodromes:    ${result.aerodromes}`);
    console.log(`  Matched by ICAO code:   ${result.matchedByCode}`);
    console.log(`  Matched by position:    ${result.matchedByDistance}`);
    console.log(`  With a website:         ${result.withWebsite}`);
    console.log(`  With a Wikipedia link:  ${result.withWikipedia}`);
    console.log(`  ${dryRun ? "Would update" : "Updated"}:${dryRun ? "          " : "               "}${result.updated}`);
    console.log("=========================\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
