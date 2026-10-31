-- Vertical obstacles from openAIP, and the sync source that imports them.
-- ADD VALUE is allowed in a transaction since PostgreSQL 12, as long as the
-- new value is not used in the same transaction.
CREATE TYPE "public"."ObstacleType" AS ENUM ('OBSTACLE', 'CHIMNEY', 'BUILDING', 'WIND_TURBINE', 'TOWER');

ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'OBSTACLES';

CREATE TABLE "public"."obstacles" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT,
    "type" "public"."ObstacleType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "heightM" INTEGER,
    "elevationM" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obstacles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "obstacles_latitude_longitude_idx" ON "public"."obstacles"("latitude", "longitude");

CREATE UNIQUE INDEX "obstacles_source_sourceId_key" ON "public"."obstacles"("source", "sourceId");
