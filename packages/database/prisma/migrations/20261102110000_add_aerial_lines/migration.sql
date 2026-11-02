-- Power lines and aerial ropeways from IGN BD TOPO, and their sync source.
-- ADD VALUE is allowed in a transaction since PostgreSQL 12, as long as the
-- new value is not used in the same transaction.
CREATE TYPE "public"."AerialLineKind" AS ENUM ('POWER_LINE', 'CABLE');

ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'AERIAL_LINES';

CREATE TABLE "public"."aerial_lines" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" "public"."AerialLineKind" NOT NULL,
    "detail" TEXT,
    "name" TEXT,
    "geometry" JSONB NOT NULL,
    "minLat" DOUBLE PRECISION NOT NULL,
    "maxLat" DOUBLE PRECISION NOT NULL,
    "minLon" DOUBLE PRECISION NOT NULL,
    "maxLon" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aerial_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aerial_lines_minLat_maxLat_minLon_maxLon_idx" ON "public"."aerial_lines"("minLat", "maxLat", "minLon", "maxLon");

CREATE UNIQUE INDEX "aerial_lines_source_sourceId_key" ON "public"."aerial_lines"("source", "sourceId");
