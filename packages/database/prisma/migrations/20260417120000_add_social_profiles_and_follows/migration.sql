ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "showPublicSearches" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."saved_searches"
ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "public"."follows" (
  "id" TEXT NOT NULL,
  "followerId" TEXT NOT NULL,
  "followingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "follows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "follows_followerId_followingId_key"
ON "public"."follows"("followerId", "followingId");

CREATE INDEX IF NOT EXISTS "follows_followerId_createdAt_idx"
ON "public"."follows"("followerId", "createdAt");

CREATE INDEX IF NOT EXISTS "follows_followingId_createdAt_idx"
ON "public"."follows"("followingId", "createdAt");
