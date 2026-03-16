import { z } from "zod";
import {
  SURFACE_TYPES,
  FUEL_TYPES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_RADIUS_KM,
} from "../constants";

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const AerodromeSearchSchema = PaginationSchema.extend({
  q: z.string().max(200).trim().optional(),
  minRunwayLength: z.coerce.number().int().positive().optional(),
  surface: z.enum(SURFACE_TYPES).optional(),
  fuel: z.enum(FUEL_TYPES).optional(),
  hasRestaurant: z.coerce.boolean().optional(),
  nightOperations: z.coerce.boolean().optional(),
  status: z.enum(["OPEN", "CLOSED", "RESTRICTED", "SEASONAL"]).optional(),
  // Geospatial
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce
    .number()
    .positive()
    .max(MAX_SEARCH_RADIUS_KM)
    .optional(),
  sortBy: z
    .enum(["name", "distance", "icaoCode", "city"])
    .default("name"),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
export type AerodromeSearchInput = z.infer<typeof AerodromeSearchSchema>;
