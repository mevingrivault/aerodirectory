#!/usr/bin/env tsx

import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@aerodirectory/database";
import { parseOpenAirFile } from "../apps/api/src/services/airspace/openair-parser";

function buildSourceId(
  airspace: {
    name: string;
    class: string;
    lowerLimit: string;
    upperLimit: string;
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  },
  index: number,
) {
  const firstPoint = airspace.geometry.coordinates[0]?.[0];
  const pointKey = firstPoint ? `${firstPoint[0].toFixed(6)}:${firstPoint[1].toFixed(6)}` : "nopoint";
  return `${airspace.class}|${airspace.name}|${airspace.lowerLimit}|${airspace.upperLimit}|${pointKey}|${index}`.toLowerCase();
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: pnpm tsx scripts/import-openair.ts <path-to-openair-file>");
    process.exit(1);
  }

  const source = (process.argv[3] ?? "openair").toLowerCase();
  const filePath = resolve(process.cwd(), fileArg);
  const content = readFileSync(filePath, "utf8");

  const parsed = parseOpenAirFile(content);
  console.log(`Parsed airspaces: ${parsed.airspaces.length}`);
  console.log(`Parse warnings: ${parsed.errors.length}`);

  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    await prisma.airspace.deleteMany({ where: { source } });

    let imported = 0;
    for (let i = 0; i < parsed.airspaces.length; i++) {
      const airspace = parsed.airspaces[i]!;
      const sourceId = buildSourceId(airspace, i);
      await prisma.airspace.create({
        data: {
          name: airspace.name,
          class: airspace.class,
          lowerLimit: airspace.lowerLimit,
          upperLimit: airspace.upperLimit,
          geometry: airspace.geometry,
          source,
          sourceId,
        },
      });
      imported++;
    }

    console.log(`Imported: ${imported}`);
    if (parsed.errors.length > 0) {
      console.log("Warnings:");
      for (const err of parsed.errors.slice(0, 20)) {
        console.log(`- ${err}`);
      }
      if (parsed.errors.length > 20) {
        console.log(`... and ${parsed.errors.length - 20} more`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
