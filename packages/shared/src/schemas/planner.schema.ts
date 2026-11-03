import { z } from "zod";
import { FUEL_TYPES, SURFACE_TYPES } from "../constants";
import { FEE_CATEGORIES } from "./community-info.schema";

export const AircraftProfileSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  tas: z.number().positive().max(500),            // knots
  fuelConsumption: z.number().positive().max(1000), // L/h
  hourlyCost: z.number().nonnegative().max(10000),  // €/h (fuel included for club aircraft)
  fuelRange: z.number().positive().max(5000),       // nm
  minRunwayLength: z.number().int().nonnegative().max(10000), // meters
  allowedSurfaces: z.array(z.enum(SURFACE_TYPES)).min(1),
  fuelType: z.enum(FUEL_TYPES).nullable().optional(), // what the aircraft burns, to refuel on the way
  category: z.enum(FEE_CATEGORIES).nullable().optional(), // ULM / up to 1.5 t / over: picks the landing fee
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
  minDistanceNm: z.number().nonnegative().max(5000).optional(),
  maxDistanceNm: z.number().positive().max(5000).optional(),
  sortBy: z.enum(["time", "cost", "distance"]).default("time"),
  excludeVisited: z.boolean().optional(),
  // Off-block time at the departure field (ISO, UTC). With it, every take-off
  // and landing is checked against aeronautical night at its field.
  departureTime: z.string().datetime().optional(),
  stayMinutes: z.number().int().min(0).max(1440).default(60), // round trip: time on the ground at the destination
  excludeNight: z.boolean().optional(),

  // Private fields need the owner's permission: left out unless asked for.
  includePrivate: z.boolean().optional(),

  // Destination filters
  filters: z
    .object({
      hasRestaurant: z.boolean().optional(),
      hasTransport: z.boolean().optional(),
      hasBikes: z.boolean().optional(),
      hasAccommodation: z.boolean().optional(),
      fuel100LL: z.boolean().optional(),
      fuelUL91: z.boolean().optional(),
      fuelSP98: z.boolean().optional(),
      fuelJetA1: z.boolean().optional(),
    })
    .optional(),
});

/** One trip between two given fields, for the briefing: computed even when out of reach. */
export const BriefingQuerySchema = z.object({
  profileId: z.string().cuid(),
  departureId: z.string().min(1).max(50),
  destinationId: z.string().min(1).max(50),
  tripScope: z.enum(["outbound", "round_trip"]).default("round_trip"),
  reserveMinutes: z.number().int().min(0).max(120).default(30),
  departureGroundMinutes: z.number().int().min(0).max(60).default(0),
  arrivalGroundMinutes: z.number().int().min(0).max(60).default(0),
  fuelPricePerLiter: z.number().nonnegative().max(10).optional(),
  departureTime: z.string().datetime().optional(),
  stayMinutes: z.number().int().min(0).max(1440).default(60),
});

export type BriefingQueryInput = z.infer<typeof BriefingQuerySchema>;
export type AircraftProfileInput = z.infer<typeof AircraftProfileSchema>;
export type PlannerQueryInput = z.infer<typeof PlannerQuerySchema>;
