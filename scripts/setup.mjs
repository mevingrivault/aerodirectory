#!/usr/bin/env node

/**
 * AeroDirectory — Automated Development Setup
 *
 * Usage: node scripts/setup.mjs
 *
 * This script:
 * 1. Copies .env.development → .env (if .env doesn't exist)
 * 2. Copies .env.development → packages/database/.env
 * 3. Copies .env.development → apps/api/.env
 * 4. Copies .env.development → apps/web/.env.local
 * 5. Runs pnpm install
 * 6. Runs prisma generate
 * 7. Runs prisma migrate dev
 * 8. Runs prisma seed
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function log(msg) {
  console.log(`\n→ ${msg}`);
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.error(`\n✗ Command failed: ${cmd}`);
    process.exit(1);
  }
}

function copyEnv(source, dest, label) {
  if (existsSync(dest)) {
    console.log(`  ✓ ${label} already exists — skipping`);
  } else {
    copyFileSync(source, dest);
    console.log(`  ✓ Created ${label}`);
  }
}

// ── Main ──────────────────────────────────────────────────

console.log("╔══════════════════════════════════════╗");
console.log("║   AeroDirectory — Development Setup  ║");
console.log("╚══════════════════════════════════════╝");

const envSource = resolve(ROOT, ".env.development");

if (!existsSync(envSource)) {
  console.error("✗ .env.development not found at project root");
  process.exit(1);
}

// Step 1: Distribute .env files
log("Setting up environment files...");
copyEnv(envSource, resolve(ROOT, ".env"), ".env (root)");
copyEnv(envSource, resolve(ROOT, "packages/database/.env"), "packages/database/.env");
copyEnv(envSource, resolve(ROOT, "apps/api/.env"), "apps/api/.env");

// For Next.js, extract only NEXT_PUBLIC_ vars
const envContent = readFileSync(envSource, "utf-8");
const webEnvPath = resolve(ROOT, "apps/web/.env.local");
if (!existsSync(webEnvPath)) {
  const webVars = envContent
    .split("\n")
    .filter((line) => line.startsWith("NEXT_PUBLIC_") || line.trim() === "" || line.startsWith("#"));
  writeFileSync(webEnvPath, webVars.join("\n") + "\n");
  console.log("  ✓ Created apps/web/.env.local");
} else {
  console.log("  ✓ apps/web/.env.local already exists — skipping");
}

// Step 2: Install dependencies
log("Installing dependencies...");
run("pnpm install");

// Step 3: Generate Prisma client
log("Generating Prisma client...");
run("pnpm db:generate");

// Step 4: Check if Docker postgres is running
log("Checking PostgreSQL...");
try {
  execSync("docker compose ps postgres --format json", {
    cwd: ROOT,
    stdio: "pipe",
  });
  const output = execSync("docker compose ps postgres", {
    cwd: ROOT,
    encoding: "utf-8",
  });
  if (!output.includes("running") && !output.includes("Running")) {
    console.log("  PostgreSQL not running — starting it...");
    run("docker compose up -d postgres");
    // Wait for it to be ready
    console.log("  Waiting for PostgreSQL to be ready...");
    run("docker compose exec postgres pg_isready -U postgres --timeout=30");
  } else {
    console.log("  ✓ PostgreSQL is running");
  }
} catch {
  console.log("  Docker not available or compose failed — skipping auto-start.");
  console.log("  Make sure PostgreSQL is running on localhost:5432 before migrating.");
}

// Step 5: Run migrations
log("Running database migrations...");
run("pnpm db:migrate");

// Step 6: Seed database
log("Seeding database...");
run("pnpm db:seed");

console.log("\n╔══════════════════════════════════════╗");
console.log("║        ✓ Setup complete!              ║");
console.log("╠══════════════════════════════════════╣");
console.log("║  Start dev servers:  pnpm dev         ║");
console.log("║  API:  http://localhost:4000           ║");
console.log("║  Web:  http://localhost:3000           ║");
console.log("╚══════════════════════════════════════╝\n");
