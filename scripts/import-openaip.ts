#!/usr/bin/env tsx

/**
 * CLI script to import French aerodromes from openAIP into the local database.
 *
 * Usage:
 *   pnpm import:openaip
 *
 * Requires:
 *   - DATABASE_URL in .env (or environment)
 *   - OPENAIP_API_KEY in .env (or environment)
 *   - PostgreSQL running with the latest migrations applied
 */

import { PrismaClient } from "@aerodirectory/database";
import { syncOpenAipFranceAirports } from "../apps/api/src/services/importers/openaip/openaip.importer";

async function main() {
  const apiKey = process.env["OPENAIP_API_KEY"];
  if (!apiKey) {
    console.error("ERROR: OPENAIP_API_KEY environment variable is not set.");
    console.error("Add it to your .env file:");
    console.error("  OPENAIP_API_KEY=your_api_key_here");
    console.error("");
    console.error("Get your API key at: https://www.openaip.net/");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // Verify database connection
    await prisma.$connect();
    console.log("Connected to database.\n");

    const result = await syncOpenAipFranceAirports(prisma, apiKey);

    if (result.errors.length > 0) {
      console.error("Errors encountered during import:");
      for (const error of result.errors.slice(0, 10)) {
        console.error(`  - ${error}`);
      }
      if (result.errors.length > 10) {
        console.error(`  ... and ${result.errors.length - 10} more`);
      }
    }

    // Print final count
    const count = await prisma.aerodrome.count();
    console.log(`Total aerodromes in database: ${count}`);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
