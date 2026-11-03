-- Aircraft category, to pick the landing fee members reported for it in
-- the planner. Existing profiles stay NULL: fee left out of the cost.
-- CREATE TYPE has no IF NOT EXISTS: the block keeps the file replayable.
DO $$ BEGIN
    CREATE TYPE "public"."AircraftCategory" AS ENUM ('ULM', 'LIGHT', 'HEAVY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."aircraft_profiles" ADD COLUMN IF NOT EXISTS "category" "public"."AircraftCategory";
