import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { CurrentUser } from "../common/decorators";
import { ok, paginated } from "../common/api-response";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  NotificationMarkReadSchema,
  NotificationsQuerySchema,
  type NotificationMarkReadInput,
  type NotificationsQueryInput,
} from "@aerodirectory/shared";

@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(
    @CurrentUser() user: { sub: string },
    @Query(new ZodValidationPipe(NotificationsQuerySchema)) query: NotificationsQueryInput,
  ) {
    const { data, total, unreadCount } = await this.notifications.listForUser(user.sub, query);
    const response = paginated(data, total, query.page ?? 1, query.limit ?? 20);
    return {
      ...response,
      meta: {
        ...response.meta,
        unreadCount,
      },
    };
  }

  @Post("read")
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(NotificationMarkReadSchema))
    body: NotificationMarkReadInput,
  ) {
    await this.notifications.markRead(user.sub, body);
    return ok({ marked: true });
  }
}
