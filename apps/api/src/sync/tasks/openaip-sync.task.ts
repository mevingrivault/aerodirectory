import type { PrismaClient } from "@aerodirectory/database";
import { syncOpenAipFranceAirports } from "../../services/importers/openaip/openaip.importer";

export async function runOpenAipSyncTask(prisma: PrismaClient, apiKey: string) {
  return syncOpenAipFranceAirports(prisma, apiKey);
}
