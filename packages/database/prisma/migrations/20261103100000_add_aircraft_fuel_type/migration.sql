-- Fuel the aircraft burns, so the planner can count on refuelling at a
-- destination that sells it. Existing profiles stay NULL: no refuel planned.
ALTER TABLE "public"."aircraft_profiles" ADD COLUMN IF NOT EXISTS "fuelType" "public"."FuelType";
