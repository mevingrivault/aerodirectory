-- Session invalidation: tokens carry the version they were issued with.
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Moderation actions on pending community content.
DO $$
BEGIN
  ALTER TYPE "public"."AuditAction" ADD VALUE 'COMMENT_APPROVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "public"."AuditAction" ADD VALUE 'COMMENT_REJECT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "public"."AuditAction" ADD VALUE 'EVENT_APPROVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "public"."AuditAction" ADD VALUE 'EVENT_REJECT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
