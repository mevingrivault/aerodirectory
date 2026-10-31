-- Protected areas relevant to overflight (IGN BD TOPO), and their sync source.
-- ADD VALUE is allowed in a transaction since PostgreSQL 12, as long as the
-- new value is not used in the same transaction.
CREATE TYPE "public"."ProtectedAreaKind" AS ENUM ('NATIONAL_PARK', 'NATURE_RESERVE', 'BIOTOPE_PROTECTION', 'BIRD_SPA', 'SILENCE_ZONE');

ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'PROTECTED_AREAS';

CREATE TABLE "public"."protected_areas" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT,
    "kind" "public"."ProtectedAreaKind" NOT NULL,
    "detail" TEXT,
    "geometry" JSONB NOT NULL,
    "minLat" DOUBLE PRECISION NOT NULL,
    "maxLat" DOUBLE PRECISION NOT NULL,
    "minLon" DOUBLE PRECISION NOT NULL,
    "maxLon" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protected_areas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "protected_areas_minLat_maxLat_minLon_maxLon_idx" ON "public"."protected_areas"("minLat", "maxLat", "minLon", "maxLon");

CREATE UNIQUE INDEX "protected_areas_source_sourceId_key" ON "public"."protected_areas"("source", "sourceId");
