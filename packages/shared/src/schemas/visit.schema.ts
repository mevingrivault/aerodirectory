import { z } from "zod";
import { VISIT_STATUSES } from "../constants";

export const VisitUpsertSchema = z.object({
  status: z.enum(VISIT_STATUSES),
  notes: z.string().max(1000).trim().optional(),
});

export type VisitUpsertInput = z.infer<typeof VisitUpsertSchema>;
