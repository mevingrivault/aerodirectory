-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('CAFE_CROISSANT', 'OPEN_DAY', 'AIRSHOW', 'OTHER');

-- AlterEnum
ALTER TYPE "public"."AuditAction" ADD VALUE 'EVENT_CREATE';
ALTER TYPE "public"."AuditAction" ADD VALUE 'EVENT_DELETE';

-- CreateTable
CREATE TABLE "public"."aerodrome_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "type" "public"."EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "contentStatus" "public"."ContentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aerodrome_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aerodrome_events_aerodromeId_contentStatus_startDate_idx" ON "public"."aerodrome_events"("aerodromeId", "contentStatus", "startDate");

-- AddForeignKey
ALTER TABLE "public"."aerodrome_events" ADD CONSTRAINT "aerodrome_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."aerodrome_events" ADD CONSTRAINT "aerodrome_events_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "public"."aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
