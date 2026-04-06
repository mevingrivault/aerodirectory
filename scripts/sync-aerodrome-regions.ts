#!/usr/bin/env tsx

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@aerodirectory/database";
import { runRegionsSyncTask } from "../apps/api/src/sync/tasks/regions-sync.task";

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

  const args = process.argv.slice(2);
  const forceAll = args.includes("--all");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    const result = await runRegionsSyncTask(prisma, {
      forceAll,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    console.log("\n=== Résumé sync:regions ===");
    console.log(`  Scope      : ${result.scope}`);
    console.log(`  Total      : ${result.total}`);
    console.log(`  Mis à jour : ${result.updated}`);
    console.log(`  Erreurs    : ${result.errors}`);

    if (result.failures.length > 0) {
      console.log("\nÉchecs :");
      for (const failure of result.failures.slice(0, 10)) {
        console.log(`  - ${failure}`);
      }
      if (result.failures.length > 10) {
        console.log(`  ... et ${result.failures.length - 10} autre(s)`);
      }
    }

    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
