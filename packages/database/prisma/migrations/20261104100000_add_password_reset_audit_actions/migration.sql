-- The password reset flow logs these actions since the reset was added, but
-- no migration created them: every such audit write failed (and was dropped).
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_REQUEST';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
