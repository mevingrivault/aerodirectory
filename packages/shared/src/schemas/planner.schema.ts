import { z } from "zod";
import { SURFACE_TYPES } from "../constants";

export const AircraftProfileSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  tas: z.number().positive().max(500), // knots
  fuelConsumption: z.number().positive().max(1000), // L/h
  hourlyCost: z.number().positive().max(10000), // €/h
  fuelRange: z.number().positive().max(5000), // nm
  minRunwayLength: z.number().int().positive().max(10000), // meters
  allowedSurfaces: z.array(z.enum(SURFACE_TYPES)).min(1),
});

export const PlannerQuerySchema = z.object({
  profileId: z.string().cuid(),
  departureLat: z.number().min(-90).max(90),
  departureLng: z.number().min(-180).max(180),
  maxDistanceNm: z.number().positive().max(5000).optional(),
  sortBy: z.enum(["time", "cost", "distance"]).default("time"),
});

export type AircraftProfileInput = z.infer<typeof AircraftProfileSchema>;
export type PlannerQueryInput = z.infer<typeof PlannerQuerySchema>;
