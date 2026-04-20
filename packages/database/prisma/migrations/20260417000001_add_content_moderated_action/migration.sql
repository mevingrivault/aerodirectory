DO $$
BEGIN
  ALTER TYPE "public"."AuditAction" ADD VALUE 'CONTENT_MODERATED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
