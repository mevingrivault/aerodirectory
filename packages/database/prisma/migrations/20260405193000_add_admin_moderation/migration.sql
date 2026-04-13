DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'UserStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'BANNED');
  END IF;
END
$$;

ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'USER_BAN';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'USER_UNBAN';

ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "bannedReason" TEXT,
ADD COLUMN IF NOT EXISTS "bannedById" TEXT;

ALTER TABLE "public"."comments"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deletedReason" TEXT,
ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_bannedById_fkey'
  ) THEN
    ALTER TABLE "public"."users"
    ADD CONSTRAINT "users_bannedById_fkey"
    FOREIGN KEY ("bannedById") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comments_deletedById_fkey'
  ) THEN
    ALTER TABLE "public"."comments"
    ADD CONSTRAINT "comments_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "users_status_idx" ON "public"."users"("status");
CREATE INDEX IF NOT EXISTS "comments_deletedAt_idx" ON "public"."comments"("deletedAt");
