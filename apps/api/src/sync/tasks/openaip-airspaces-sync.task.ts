import type { PrismaClient } from "@aerodirectory/database";
import { syncOpenAipAirspaces } from "../../services/importers/openaip/openaip-airspaces.importer";

export async function runOpenAipAirspacesSyncTask(prisma: PrismaClient, apiKey: string) {
  return syncOpenAipAirspaces(prisma, apiKey);
}
