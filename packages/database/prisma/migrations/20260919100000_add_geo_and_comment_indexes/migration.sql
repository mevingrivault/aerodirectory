-- Bounding-box searches (nearby, search radius, map) and the public comment
-- listing were full scans.
CREATE INDEX IF NOT EXISTS "aerodromes_latitude_longitude_idx"
  ON "public"."aerodromes"("latitude", "longitude");

CREATE INDEX IF NOT EXISTS "comments_aerodromeId_parentId_contentStatus_deletedAt_idx"
  ON "public"."comments"("aerodromeId", "parentId", "contentStatus", "deletedAt");
