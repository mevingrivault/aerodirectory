import { Injectable } from "@nestjs/common";
import { Prisma } from "@aerodirectory/database";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationMarkReadInput, NotificationsQueryInput } from "@aerodirectory/shared";

interface NotifyUserInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkUrl?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUser(input: NotifyUserInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async notifyUsers(inputs: NotifyUserInput[]) {
    if (inputs.length === 0) return;
    await this.prisma.notification.createMany({
      data: inputs.map((input) => ({
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl ?? null,
        metadata: input.metadata ?? undefined,
      })),
    });
  }

  async listForUser(userId: string, query: NotificationsQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const unreadOnly = query.unreadOnly === true;

    const where = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      data: data.map((n) => ({
        ...n,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      total,
      unreadCount,
    };
  }

  async markRead(userId: string, input: NotificationMarkReadInput) {
    if (input.all) {
      await this.prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return;
    }

    if (input.ids && input.ids.length > 0) {
      await this.prisma.notification.updateMany({
        where: {
          userId,
          id: { in: input.ids },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
      return;
    }

    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
