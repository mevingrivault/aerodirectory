/**
 * migrate.mjs — Apply pending Prisma migrations without Prisma CLI.
 *
 * Prisma 7 with earlyAccess driver adapter mode makes `prisma migrate deploy`
 * require the adapter URL inside prisma.config.ts, which is incompatible with
 * direct connection strings. This script replicates migrate deploy behaviour:
 *  1. Ensures the _prisma_migrations table exists.
 *  2. Reads migration directories from packages/database/prisma/migrations.
 *  3. Applies any migration whose name is not yet in _prisma_migrations.
 *  4. Records each applied migration in _prisma_migrations.
 */

import pg from "/app/packages/database/node_modules/pg/lib/index.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const { Client } = pg;

const MIGRATIONS_DIR = "/app/packages/database/prisma/migrations";
const MIGRATIONS_TABLE = '"public"."_prisma_migrations"';

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id                  TEXT PRIMARY KEY,
      checksum            TEXT NOT NULL,
      finished_at         TIMESTAMPTZ,
      migration_name      TEXT NOT NULL,
      logs                TEXT,
      rolled_back_at      TIMESTAMPTZ,
      started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function getAppliedMigrations() {
  const res = await client.query(
    `SELECT migration_name FROM ${MIGRATIONS_TABLE} WHERE finished_at IS NOT NULL`
  );
  return new Set(res.rows.map((r) => r.migration_name));
}

async function applyMigration(name, sql) {
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");
  const id = crypto.randomUUID();

  await client.query(
    `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, migration_name, started_at, applied_steps_count)
     VALUES ($1, $2, $3, now(), 0)`,
    [id, checksum, name]
  );

  await client.query(sql);

  await client.query(
    `UPDATE ${MIGRATIONS_TABLE}
     SET finished_at = now(), applied_steps_count = 1
     WHERE id = $1`,
    [id]
  );
}

async function main() {
  await client.connect();

  try {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const entries = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    let pending = 0;
    for (const name of entries) {
      if (applied.has(name)) continue;

      const sqlFile = path.join(MIGRATIONS_DIR, name, "migration.sql");
      if (!fs.existsSync(sqlFile)) continue;

      const sql = fs.readFileSync(sqlFile, "utf8");
      console.log(`  → Applying: ${name}`);
      await applyMigration(name, sql);
      pending++;
    }

    if (pending === 0) {
      console.log("  Already up to date.");
    } else {
      console.log(`  ${pending} migration(s) applied.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
