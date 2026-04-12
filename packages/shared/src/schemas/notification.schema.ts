import { z } from "zod";

export const NotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
});

export const NotificationMarkReadSchema = z.object({
  ids: z.array(z.string().cuid()).max(200).optional(),
  all: z.boolean().optional(),
});

export type NotificationsQueryInput = z.infer<typeof NotificationsQuerySchema>;
export type NotificationMarkReadInput = z.infer<typeof NotificationMarkReadSchema>;
