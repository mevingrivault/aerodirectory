-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VISITOR', 'MEMBER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AerodromeStatus" AS ENUM ('OPEN', 'CLOSED', 'RESTRICTED', 'SEASONAL');

-- CreateEnum
CREATE TYPE "AerodromeType" AS ENUM ('SMALL_AIRPORT', 'INTERNATIONAL_AIRPORT', 'GLIDER_SITE', 'ULTRALIGHT_FIELD', 'HELIPORT', 'MILITARY', 'SEAPLANE_BASE', 'OTHER');

-- CreateEnum
CREATE TYPE "SurfaceType" AS ENUM ('ASPHALT', 'CONCRETE', 'GRASS', 'GRAVEL', 'DIRT', 'WATER', 'OTHER');

-- CreateEnum
CREATE TYPE "FrequencyType" AS ENUM ('TWR', 'AFIS', 'ATIS', 'APP', 'UNICOM', 'GROUND', 'CTAF', 'FIS', 'OTHER');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('AVGAS_100LL', 'UL91', 'JET_A1');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CARD', 'CASH', 'TOTAL_CARD', 'BP_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SEEN', 'VISITED', 'FAVORITE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'EMAIL_CHANGE', 'TOTP_ENABLE', 'TOTP_DISABLE', 'ACCOUNT_CREATE', 'ACCOUNT_DELETE', 'ROLE_CHANGE', 'COMMENT_CREATE', 'COMMENT_DELETE', 'CORRECTION_PROPOSE', 'REPORT_CREATE', 'ADMIN_ACTION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aerodromes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icaoCode" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "elevation" INTEGER,
    "city" TEXT,
    "region" TEXT,
    "department" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'FR',
    "aerodromeType" "AerodromeType" NOT NULL DEFAULT 'SMALL_AIRPORT',
    "status" "AerodromeStatus" NOT NULL DEFAULT 'OPEN',
    "aipLink" TEXT,
    "vacLink" TEXT,
    "websiteUrl" TEXT,
    "description" TEXT,
    "hasRestaurant" BOOLEAN NOT NULL DEFAULT false,
    "hasBikes" BOOLEAN NOT NULL DEFAULT false,
    "hasTransport" BOOLEAN NOT NULL DEFAULT false,
    "hasAccommodation" BOOLEAN NOT NULL DEFAULT false,
    "hasMaintenance" BOOLEAN NOT NULL DEFAULT false,
    "hasHangars" BOOLEAN NOT NULL DEFAULT false,
    "nightOperations" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "sourceId" TEXT,
    "sourceRawHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aerodromes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runways" (
    "id" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "width" INTEGER,
    "surface" "SurfaceType" NOT NULL,
    "lighting" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frequencies" (
    "id" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "type" "FrequencyType" NOT NULL,
    "mhz" DOUBLE PRECISION NOT NULL,
    "callsign" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "frequencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuels" (
    "id" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "type" "FuelType" NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "selfService" BOOLEAN NOT NULL DEFAULT false,
    "availabilityHours" TEXT,
    "paymentType" "PaymentType" NOT NULL DEFAULT 'CARD',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'VISITED',
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "currentValue" TEXT,
    "proposedValue" TEXT NOT NULL,
    "reason" TEXT,
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircraft_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tas" DOUBLE PRECISION NOT NULL,
    "fuelConsumption" DOUBLE PRECISION NOT NULL,
    "hourlyCost" DOUBLE PRECISION NOT NULL,
    "fuelRange" DOUBLE PRECISION NOT NULL,
    "minRunwayLength" INTEGER NOT NULL,
    "allowedSurfaces" "SurfaceType"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircraft_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "lowerLimit" TEXT NOT NULL,
    "upperLimit" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "source" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airspaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_key" ON "email_tokens"("token");

-- CreateIndex
CREATE INDEX "email_tokens_token_idx" ON "email_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "aerodromes_icaoCode_key" ON "aerodromes"("icaoCode");

-- CreateIndex
CREATE INDEX "aerodromes_icaoCode_idx" ON "aerodromes"("icaoCode");

-- CreateIndex
CREATE INDEX "aerodromes_name_idx" ON "aerodromes"("name");

-- CreateIndex
CREATE INDEX "aerodromes_city_idx" ON "aerodromes"("city");

-- CreateIndex
CREATE INDEX "aerodromes_region_idx" ON "aerodromes"("region");

-- CreateIndex
CREATE INDEX "aerodromes_countryCode_idx" ON "aerodromes"("countryCode");

-- CreateIndex
CREATE INDEX "aerodromes_aerodromeType_idx" ON "aerodromes"("aerodromeType");

-- CreateIndex
CREATE UNIQUE INDEX "aerodromes_source_sourceId_key" ON "aerodromes"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "visits_userId_aerodromeId_key" ON "visits"("userId", "aerodromeId");

-- CreateIndex
CREATE INDEX "comments_aerodromeId_idx" ON "comments"("aerodromeId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "airspaces_class_idx" ON "airspaces"("class");

-- CreateIndex
CREATE UNIQUE INDEX "airspaces_source_sourceId_key" ON "airspaces"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runways" ADD CONSTRAINT "runways_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencies" ADD CONSTRAINT "frequencies_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuels" ADD CONSTRAINT "fuels_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft_profiles" ADD CONSTRAINT "aircraft_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
