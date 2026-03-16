#!/usr/bin/env node

/**
 * AeroDirectory — Automated Development Setup
 *
 * Usage: node scripts/setup.mjs
 *
 * This script:
 * 1. Copies .env.development → .env, packages/database/.env, apps/api/.env
 * 2. Extracts NEXT_PUBLIC_ vars → apps/web/.env.local
 * 3. Ensures all .env files are valid UTF-8 (fixes Windows UTF-16 issues)
 * 4. Runs pnpm install
 * 5. Runs prisma generate
 * 6. Runs prisma migrate dev
 * 7. Runs prisma seed
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
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

/**
 * Read a file and guarantee clean UTF-8 output.
 * Strips UTF-8 BOM (\xEF\xBB\xBF) and detects UTF-16 BOM (\xFF\xFE or \xFE\xFF).
 * If the file is UTF-16 encoded (common on Windows with PowerShell),
 * it is decoded properly and returned as UTF-8.
 */
function readFileAsUtf8(filePath) {
  const raw = readFileSync(filePath);

  // UTF-16 LE BOM: FF FE
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    console.log(`  ⚠ ${filePath} is UTF-16 LE — converting to UTF-8`);
    return raw.toString("utf16le").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  }

  // UTF-16 BE BOM: FE FF
  if (raw[0] === 0xfe && raw[1] === 0xff) {
    console.log(`  ⚠ ${filePath} is UTF-16 BE — converting to UTF-8`);
    // Swap bytes for utf16le decoding
    for (let i = 0; i < raw.length - 1; i += 2) {
      const tmp = raw[i];
      raw[i] = raw[i + 1];
      raw[i + 1] = tmp;
    }
    return raw.toString("utf16le").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  }

  // UTF-8 with BOM: EF BB BF
  let str = raw.toString("utf-8");
  if (str.charCodeAt(0) === 0xfeff) {
    str = str.slice(1);
  }

  return str.replace(/\r\n/g, "\n");
}

/**
 * Write content as clean UTF-8 without BOM.
 */
function writeUtf8(dest, content) {
  // Ensure trailing newline
  const clean = content.endsWith("\n") ? content : content + "\n";
  writeFileSync(dest, clean, "utf-8");
}

/**
 * Copy a .env source to dest, always ensuring UTF-8 output.
 * Overwrites existing files to fix encoding issues.
 */
function copyEnvUtf8(source, dest, label) {
  const content = readFileAsUtf8(source);
  writeUtf8(dest, content);
  console.log(`  ✓ ${label}`);
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

// Step 1: Distribute .env files (always overwrite to fix encoding)
log("Setting up environment files (UTF-8)...");

// First, sanitize .env.development itself in case it was edited on Windows
const envDevContent = readFileAsUtf8(envSource);
writeUtf8(envSource, envDevContent);

// Copy to all locations
copyEnvUtf8(envSource, resolve(ROOT, ".env"), ".env (root)");
copyEnvUtf8(envSource, resolve(ROOT, "packages/database/.env"), "packages/database/.env");
copyEnvUtf8(envSource, resolve(ROOT, "apps/api/.env"), "apps/api/.env");

// For Next.js, extract only NEXT_PUBLIC_ vars
const webEnvPath = resolve(ROOT, "apps/web/.env.local");
const webVars = envDevContent
  .split("\n")
  .filter((line) => line.startsWith("NEXT_PUBLIC_") || line.trim() === "" || line.startsWith("#"));
writeUtf8(webEnvPath, webVars.join("\n"));
console.log("  ✓ apps/web/.env.local");

// Also sanitize any existing .env if it was already there with bad encoding
const rootEnv = resolve(ROOT, ".env");
if (existsSync(rootEnv)) {
  const currentContent = readFileAsUtf8(rootEnv);
  writeUtf8(rootEnv, currentContent);
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
console.log("║                                        ║");
console.log("║  Import openAIP data:                  ║");
console.log("║    pnpm import:openaip                 ║");
console.log("╚══════════════════════════════════════╝\n");
