-- CreateEnum
CREATE TYPE "public"."PhotoStatus" AS ENUM ('PENDING', 'SCANNING', 'REJECTED', 'READY');

-- AlterEnum
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'PHOTO_UPLOAD';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'PHOTO_DELETE';

-- CreateTable
CREATE TABLE "public"."photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "originalFilename" TEXT,
    "storedFilename" TEXT NOT NULL,
    "storedKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "public"."PhotoStatus" NOT NULL DEFAULT 'PENDING',
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photos_aerodromeId_status_idx" ON "public"."photos"("aerodromeId", "status");

-- CreateIndex
CREATE INDEX "photos_userId_idx" ON "public"."photos"("userId");

-- AddForeignKey
ALTER TABLE "public"."photos" ADD CONSTRAINT "photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."photos" ADD CONSTRAINT "photos_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "public"."aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
