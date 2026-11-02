-- Phone numbers, contact, opening hours and remarks from openAIP.
ALTER TABLE "public"."aerodromes" ADD COLUMN IF NOT EXISTS "contactInfo" TEXT,
ADD COLUMN IF NOT EXISTS "openingHours" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "phones" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "sourceRemarks" TEXT;
