ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

DO $$
BEGIN
  ALTER TYPE "public"."AuditAction" ADD VALUE 'ACCOUNT_LOCKED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
