-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."users" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "public"."AuditAction" ADD VALUE 'ACCOUNT_LOCKED';
