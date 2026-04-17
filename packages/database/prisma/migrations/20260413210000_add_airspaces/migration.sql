-- Add AIRSPACES to SyncSource enum
ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'AIRSPACES';

-- Drop old minimal airspaces table if it exists (stub from earlier schema)
DROP TABLE IF EXISTS "public"."airspaces";

-- Create airspaces table
CREATE TABLE "public"."airspaces" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "type"          INTEGER NOT NULL,
    "icaoClass"     TEXT NOT NULL,
    "lowerLimit"    TEXT NOT NULL,
    "upperLimit"    TEXT NOT NULL,
    "lowerLimitFt"  INTEGER,
    "upperLimitFt"  INTEGER,
    "geometry"      JSONB NOT NULL,
    "countryCode"   TEXT NOT NULL DEFAULT 'FR',
    "activity"      INTEGER,
    "onDemand"      BOOLEAN NOT NULL DEFAULT false,
    "onRequest"     BOOLEAN NOT NULL DEFAULT false,
    "remarks"       TEXT,
    "sourceId"      TEXT,
    "sourceRawHash" TEXT,
    "lastSyncedAt"  TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airspaces_pkey" PRIMARY KEY ("id")
);

-- Unique + indexes
CREATE UNIQUE INDEX "airspaces_sourceId_key" ON "public"."airspaces"("sourceId");
CREATE INDEX "airspaces_type_idx"        ON "public"."airspaces"("type");
CREATE INDEX "airspaces_icaoClass_idx"   ON "public"."airspaces"("icaoClass");
CREATE INDEX "airspaces_countryCode_idx" ON "public"."airspaces"("countryCode");
