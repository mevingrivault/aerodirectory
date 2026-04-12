import { z } from "zod";

export const AerodromeListCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
});

export const AerodromeListUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
});

export const AerodromeListItemCreateSchema = z.object({
  aerodromeId: z.string().cuid(),
  note: z.string().trim().max(200).optional(),
});

export type AerodromeListCreateInput = z.infer<typeof AerodromeListCreateSchema>;
export type AerodromeListUpdateInput = z.infer<typeof AerodromeListUpdateSchema>;
export type AerodromeListItemCreateInput = z.infer<typeof AerodromeListItemCreateSchema>;
