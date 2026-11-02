-- Prevailing-wind climatology of Météo-France stations, and its sync source.
-- ADD VALUE is allowed in a transaction since PostgreSQL 12, as long as the
-- new value is not used in the same transaction.
ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'WIND_CLIMATE';

CREATE TABLE "public"."wind_climate" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitudeM" INTEGER,
    "periodStart" INTEGER NOT NULL,
    "periodEnd" INTEGER NOT NULL,
    "observations" INTEGER NOT NULL,
    "calm" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wind_climate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wind_climate_stationId_key" ON "public"."wind_climate"("stationId");

CREATE INDEX "wind_climate_latitude_longitude_idx" ON "public"."wind_climate"("latitude", "longitude");
