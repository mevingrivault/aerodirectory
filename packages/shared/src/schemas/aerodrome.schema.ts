import { z } from "zod";
import { SURFACE_TYPES, FREQUENCY_TYPES, FUEL_TYPES } from "../constants";

export const RunwaySchema = z.object({
  identifier: z.string().min(1).max(10),
  length: z.number().int().positive().max(10000),
  width: z.number().int().positive().max(500).optional(),
  surface: z.enum(SURFACE_TYPES),
  lighting: z.boolean().default(false),
  remarks: z.string().max(500).optional(),
});

export const FrequencySchema = z.object({
  type: z.enum(FREQUENCY_TYPES),
  mhz: z.number().min(100).max(500),
  callsign: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const FuelSchema = z.object({
  type: z.enum(FUEL_TYPES),
  available: z.boolean().default(true),
  selfService: z.boolean().default(false),
  availabilityHours: z.string().max(50).optional(),
  paymentType: z.enum(["CARD", "CASH", "TOTAL_CARD", "BP_CARD", "OTHER"]).default("CARD"),
  remarks: z.string().max(500).optional(),
});

export const AerodromeCreateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  icaoCode: z
    .string()
    .regex(/^[A-Z]{4}$/, "ICAO code must be 4 uppercase letters")
    .optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation: z.number().int().min(-2000).max(20000).optional(),
  city: z.string().max(200).trim().optional(),
  region: z.string().max(200).trim().optional(),
  department: z.string().max(200).trim().optional(),
  status: z.enum(["OPEN", "CLOSED", "RESTRICTED", "SEASONAL"]).default("OPEN"),
  aipLink: z.string().url().max(500).optional(),
  vacLink: z.string().url().max(500).optional(),
  websiteUrl: z.string().url().max(500).optional(),
  description: z.string().max(5000).optional(),
  hasRestaurant: z.boolean().default(false),
  hasBikes: z.boolean().default(false),
  hasTransport: z.boolean().default(false),
  hasAccommodation: z.boolean().default(false),
  hasMaintenance: z.boolean().default(false),
  hasHangars: z.boolean().default(false),
  nightOperations: z.boolean().default(false),
  runways: z.array(RunwaySchema).optional(),
  frequencies: z.array(FrequencySchema).optional(),
  fuels: z.array(FuelSchema).optional(),
});

export const AerodromeUpdateSchema = AerodromeCreateSchema.partial();

export type RunwayInput = z.infer<typeof RunwaySchema>;
export type FrequencyInput = z.infer<typeof FrequencySchema>;
export type FuelInput = z.infer<typeof FuelSchema>;
export type AerodromeCreateInput = z.infer<typeof AerodromeCreateSchema>;
export type AerodromeUpdateInput = z.infer<typeof AerodromeUpdateSchema>;
