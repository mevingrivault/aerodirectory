-- Create dedicated OSM schema (isolated from app data)
CREATE SCHEMA IF NOT EXISTS "osm";

-- CreateTable
CREATE TABLE "osm"."pois" (
    "osmId"      TEXT             NOT NULL,
    "lat"        DOUBLE PRECISION NOT NULL,
    "lon"        DOUBLE PRECISION NOT NULL,
    "category"   TEXT             NOT NULL,
    "tags"       JSONB            NOT NULL,
    "importedAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pois_pkey" PRIMARY KEY ("osmId")
);

-- Index for bounding-box + category queries
CREATE INDEX "pois_category_lat_lon_idx" ON "osm"."pois"("category", "lat", "lon");
