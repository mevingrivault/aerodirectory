-- Wikipedia article of the aerodrome, filled by the OurAirports import.
ALTER TABLE "public"."aerodromes" ADD COLUMN IF NOT EXISTS "wikipediaUrl" TEXT;
