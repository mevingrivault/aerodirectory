import { z } from "zod";

export const EVENT_TYPES = ["CAFE_CROISSANT", "OPEN_DAY", "AIRSHOW", "OTHER"] as const;

export const EventCreateSchema = z.object({
  type: z.enum(EVENT_TYPES),
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
});

export type EventCreateInput = z.infer<typeof EventCreateSchema>;
