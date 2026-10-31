-- Small copy of each Commons photo for the search results; filled by the next import.
ALTER TABLE "public"."commons_photos" ADD COLUMN IF NOT EXISTS "thumbKey" TEXT;
