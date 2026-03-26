import { z } from "zod";
import { SURFACE_TYPES } from "../constants";

export const AircraftProfileSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  tas: z.number().positive().max(500),            // knots
  fuelConsumption: z.number().positive().max(1000), // L/h
  hourlyCost: z.number().nonnegative().max(10000),  // €/h (fuel included for club aircraft)
  fuelRange: z.number().positive().max(5000),       // nm
  minRunwayLength: z.number().int().nonnegative().max(10000), // meters
  allowedSurfaces: z.array(z.enum(SURFACE_TYPES)).min(1),
});

export const PlannerQuerySchema = z.object({
  profileId: z.string().cuid(),
  departureLat: z.number().min(-90).max(90),
  departureLng: z.number().min(-180).max(180),

  // Constraint mode
  searchMode: z.enum(["time", "cost", "unlimited"]).default("time"),
  maxTimeMinutes: z.number().int().positive().max(480).optional(),
  maxCost: z.number().positive().max(10000).optional(),

  // Trip scope
  tripScope: z.enum(["outbound", "round_trip"]).default("round_trip"),

  // Optional: fuel price added on top of hourly rate (for aircraft owners)
  fuelPricePerLiter: z.number().nonnegative().max(10).optional(),

  // Safety margin
  reserveMinutes: z.number().int().min(0).max(120).default(30),

  // Ground procedures overhead
  departureGroundMinutes: z.number().int().min(0).max(60).default(0),
  arrivalGroundMinutes: z.number().int().min(0).max(60).default(0),

  // Sorting & legacy
  maxDistanceNm: z.number().positive().max(5000).optional(),
  sortBy: z.enum(["time", "cost", "distance"]).default("time"),

  // Destination filters
  filters: z
    .object({
      hasRestaurant: z.boolean().optional(),
      hasTransport: z.boolean().optional(),
      hasBikes: z.boolean().optional(),
      hasAccommodation: z.boolean().optional(),
      fuel100LL: z.boolean().optional(),
      fuelSP98: z.boolean().optional(),
    })
    .optional(),
});

export type AircraftProfileInput = z.infer<typeof AircraftProfileSchema>;
export type PlannerQueryInput = z.infer<typeof PlannerQuerySchema>;
