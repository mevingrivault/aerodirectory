ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'PHOTO_APPROVE';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'PHOTO_REJECT';

ALTER TABLE "public"."photos"
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "public"."photos"
ADD CONSTRAINT "photos_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "photos_status_createdAt_idx" ON "public"."photos"("status", "createdAt");
CREATE INDEX "photos_reviewedById_idx" ON "public"."photos"("reviewedById");
