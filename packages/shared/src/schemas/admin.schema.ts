import { z } from "zod";
import { PaginationSchema } from "./search.schema";

const optionalText = z.string().trim().max(500).optional();

export const AdminUsersQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  status: z.enum(["ACTIVE", "BANNED", "all"]).optional(),
});

export const AdminCommentsQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  state: z.enum(["active", "reported", "all"]).optional(),
});

export const AdminCorrectionsQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  state: z.enum(["pending", "approved", "rejected", "all"]).optional(),
});

export const AdminPhotosQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  state: z.enum(["pending", "approved", "rejected", "all"]).optional(),
});

export const AdminReportsQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  state: z.enum(["pending", "approved", "rejected", "all"]).optional(),
  targetType: z.enum(["comment", "correction", "photo", "all"]).optional(),
});

export const AdminMailEventsQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  status: z.enum(["sent", "failed", "all"]).optional(),
  template: z
    .enum(["password_reset", "email_verification", "sync_summary", "all"])
    .optional(),
});

export const AdminContentAuditQuerySchema = PaginationSchema.extend({
  targetType: z.enum(["comment", "correction", "photo", "user", "all"]).optional(),
  actionType: z
    .enum([
      "COMMENT_DELETE",
      "COMMENT_RESTORE",
      "CORRECTION_APPROVE",
      "CORRECTION_REJECT",
      "PHOTO_APPROVE",
      "PHOTO_REJECT",
      "REPORT_APPROVE",
      "REPORT_REJECT",
      "USER_BAN",
      "USER_UNBAN",
      "USER_DELETE",
      "all",
    ])
    .optional(),
});

export const BanUserSchema = z.object({
  reason: optionalText,
});

export const DeleteAdminUserSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  reason: optionalText,
});

export const DeleteAdminCommentSchema = z.object({
  reason: optionalText,
});

export const RestoreAdminCommentSchema = z.object({
  note: optionalText,
});

export const ReviewAdminCorrectionSchema = z.object({
  note: optionalText,
});

export const ApproveAdminPhotoSchema = z.object({
  note: optionalText,
});

export const RejectAdminPhotoSchema = z.object({
  reason: optionalText,
});

export const ReviewAdminReportSchema = z.object({
  note: optionalText,
});

export const AdminImportOpenAirSchema = z.object({
  content: z.string().min(1),
  source: z.string().trim().min(1).max(80).default("openair"),
  replaceSource: z.boolean().default(true),
});

export type AdminUsersQueryInput = z.infer<typeof AdminUsersQuerySchema>;
export type AdminCommentsQueryInput = z.infer<typeof AdminCommentsQuerySchema>;
export type AdminCorrectionsQueryInput = z.infer<typeof AdminCorrectionsQuerySchema>;
export type AdminPhotosQueryInput = z.infer<typeof AdminPhotosQuerySchema>;
export type AdminReportsQueryInput = z.infer<typeof AdminReportsQuerySchema>;
export type AdminMailEventsQueryInput = z.infer<typeof AdminMailEventsQuerySchema>;
export type AdminContentAuditQueryInput = z.infer<typeof AdminContentAuditQuerySchema>;
export type BanUserInput = z.infer<typeof BanUserSchema>;
export type DeleteAdminUserInput = z.infer<typeof DeleteAdminUserSchema>;
export type DeleteAdminCommentInput = z.infer<typeof DeleteAdminCommentSchema>;
export type RestoreAdminCommentInput = z.infer<typeof RestoreAdminCommentSchema>;
export type ReviewAdminCorrectionInput = z.infer<typeof ReviewAdminCorrectionSchema>;
export type ApproveAdminPhotoInput = z.infer<typeof ApproveAdminPhotoSchema>;
export type RejectAdminPhotoInput = z.infer<typeof RejectAdminPhotoSchema>;
export type ReviewAdminReportInput = z.infer<typeof ReviewAdminReportSchema>;
export type AdminImportOpenAirInput = z.infer<typeof AdminImportOpenAirSchema>;
