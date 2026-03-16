import { z } from "zod";
import { MAX_COMMENT_LENGTH } from "../constants";

export const CommentCreateSchema = z.object({
  content: z.string().min(1).max(MAX_COMMENT_LENGTH).trim(),
});

export const CorrectionCreateSchema = z.object({
  field: z.string().min(1).max(100),
  proposedValue: z.string().min(1).max(2000).trim(),
  reason: z.string().max(1000).trim().optional(),
});

export const ReportCreateSchema = z.object({
  targetType: z.enum(["comment", "correction"]),
  targetId: z.string().cuid(),
  reason: z.string().min(1).max(1000).trim(),
});

export type CommentCreateInput = z.infer<typeof CommentCreateSchema>;
export type CorrectionCreateInput = z.infer<typeof CorrectionCreateSchema>;
export type ReportCreateInput = z.infer<typeof ReportCreateSchema>;
