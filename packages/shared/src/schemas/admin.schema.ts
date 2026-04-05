import { z } from "zod";
import { PaginationSchema } from "./search.schema";

const optionalText = z.string().trim().max(500).optional();

export const AdminUsersQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  status: z.enum(["ACTIVE", "BANNED", "all"]).optional(),
});

export const AdminCommentsQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  state: z.enum(["active", "deleted", "all"]).optional(),
});

export const BanUserSchema = z.object({
  reason: optionalText,
});

export const DeleteAdminCommentSchema = z.object({
  reason: optionalText,
});

export type AdminUsersQueryInput = z.infer<typeof AdminUsersQuerySchema>;
export type AdminCommentsQueryInput = z.infer<typeof AdminCommentsQuerySchema>;
export type BanUserInput = z.infer<typeof BanUserSchema>;
export type DeleteAdminCommentInput = z.infer<typeof DeleteAdminCommentSchema>;
