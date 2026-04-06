CREATE TYPE "public"."SyncSource" AS ENUM ('OPENAIP', 'OSM', 'REGIONS', 'RGPD');

CREATE TYPE "public"."SyncRunType" AS ENUM ('SCHEDULED', 'MANUAL', 'RETRY', 'RECOVERY');

CREATE TYPE "public"."SyncRunStatus" AS ENUM (
  'QUEUED',
  'RETRY_SCHEDULED',
  'IN_PROGRESS',
  'SUCCESS',
  'PARTIAL',
  'FAILED',
  'SKIPPED'
);

CREATE TYPE "public"."SyncStepStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'SKIPPED'
);

CREATE TABLE "public"."sync_runs" (
  "id" TEXT NOT NULL,
  "source" "public"."SyncSource" NOT NULL,
  "runType" "public"."SyncRunType" NOT NULL,
  "scope" TEXT,
  "status" "public"."SyncRunStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "summary" JSONB,
  "errorMessage" TEXT,
  "recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nextRetryAt" TIMESTAMP(3),
  "triggeredByUserId" TEXT,
  "workerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."sync_run_steps" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "status" "public"."SyncStepStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "metrics" JSONB,
  "checkpoint" JSONB,
  "artifactPath" TEXT,
  "logSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_run_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_run_steps_runId_stepKey_key" ON "public"."sync_run_steps"("runId", "stepKey");
CREATE INDEX "sync_runs_source_status_idx" ON "public"."sync_runs"("source", "status");
CREATE INDEX "sync_runs_status_scheduledFor_idx" ON "public"."sync_runs"("status", "scheduledFor");
CREATE INDEX "sync_runs_nextRetryAt_idx" ON "public"."sync_runs"("nextRetryAt");
CREATE INDEX "sync_runs_createdAt_idx" ON "public"."sync_runs"("createdAt");
CREATE INDEX "sync_run_steps_status_idx" ON "public"."sync_run_steps"("status");
CREATE INDEX "sync_run_steps_runId_stepOrder_idx" ON "public"."sync_run_steps"("runId", "stepOrder");

CREATE UNIQUE INDEX "sync_runs_unique_active_source_idx"
ON "public"."sync_runs"("source")
WHERE "status" IN ('QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS');

ALTER TABLE "public"."sync_runs"
ADD CONSTRAINT "sync_runs_triggeredByUserId_fkey"
FOREIGN KEY ("triggeredByUserId") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."sync_run_steps"
ADD CONSTRAINT "sync_run_steps_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "public"."sync_runs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
