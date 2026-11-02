-- Moderated practical information from members (fuel prices, fees, hangar,
-- webcam links) and webcams imported from Cam-Aéro, with their sync source.
-- ADD VALUE is allowed in a transaction since PostgreSQL 12, as long as the
-- new value is not used in the same transaction.
CREATE TYPE "public"."CommunityInfoKind" AS ENUM ('FUEL_PRICE', 'LANDING_FEE', 'HANGAR', 'WEBCAM');

ALTER TYPE "public"."SyncSource" ADD VALUE IF NOT EXISTS 'CAM_AERO';

ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'COMMUNITY_INFO_PROPOSE';

CREATE TABLE "public"."community_infos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "kind" "public"."CommunityInfoKind" NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "contentStatus" "public"."ContentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_infos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_infos_aerodromeId_contentStatus_kind_key_observed_idx" ON "public"."community_infos"("aerodromeId", "contentStatus", "kind", "key", "observedAt");

CREATE INDEX "community_infos_contentStatus_createdAt_idx" ON "public"."community_infos"("contentStatus", "createdAt");

ALTER TABLE "public"."community_infos" ADD CONSTRAINT "community_infos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."community_infos" ADD CONSTRAINT "community_infos_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "public"."aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."webcams" (
    "id" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "lastImageAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webcams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webcams_sourceId_key" ON "public"."webcams"("sourceId");

CREATE INDEX "webcams_aerodromeId_idx" ON "public"."webcams"("aerodromeId");

ALTER TABLE "public"."webcams" ADD CONSTRAINT "webcams_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "public"."aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
