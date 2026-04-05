CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'BANNED');

ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'USER_BAN';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'USER_UNBAN';

ALTER TABLE "public"."users"
ADD COLUMN "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "bannedAt" TIMESTAMP(3),
ADD COLUMN "bannedReason" TEXT,
ADD COLUMN "bannedById" TEXT;

ALTER TABLE "public"."comments"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedReason" TEXT,
ADD COLUMN "deletedById" TEXT;

ALTER TABLE "public"."users"
ADD CONSTRAINT "users_bannedById_fkey"
FOREIGN KEY ("bannedById") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."comments"
ADD CONSTRAINT "comments_deletedById_fkey"
FOREIGN KEY ("deletedById") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_status_idx" ON "public"."users"("status");
CREATE INDEX "comments_deletedAt_idx" ON "public"."comments"("deletedAt");
