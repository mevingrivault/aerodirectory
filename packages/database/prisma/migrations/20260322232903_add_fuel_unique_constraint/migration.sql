-- Remove duplicate fuels: keep the oldest row per (aerodromeId, type) pair
DELETE FROM "fuels"
WHERE id NOT IN (
  SELECT DISTINCT ON ("aerodromeId", type) id
  FROM "fuels"
  ORDER BY "aerodromeId", type, "createdAt" ASC
);

-- CreateIndex
CREATE UNIQUE INDEX "fuels_aerodromeId_type_key" ON "fuels"("aerodromeId", "type");
