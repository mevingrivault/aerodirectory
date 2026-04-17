import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notification/notification.service";
import type {
  CommentCreateInput,
  CorrectionCreateInput,
  ReportCreateInput,
  EventCreateInput,
} from "@aerodirectory/shared";

// Comptes de moins de 7 jours : contributions soumises à modération
const NEW_ACCOUNT_THRESHOLD_DAYS = 7;

function accountAgeDays(createdAt: Date): number {
  return (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
}

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async createComment(
    userId: string,
    aerodromeId: string,
    input: CommentCreateInput,
    ip?: string,
  ) {
    if (input.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: input.parentId },
        select: {
          id: true,
          aerodromeId: true,
          userId: true,
          parentId: true,
          deletedAt: true,
          contentStatus: true,
        },
      });

      if (!parent || parent.aerodromeId !== aerodromeId || parent.deletedAt) {
        throw new NotFoundException("Commentaire parent introuvable.");
      }

      if (parent.contentStatus !== "APPROVED") {
        throw new BadRequestException(
          "Impossible de répondre à un commentaire en attente de modération.",
        );
      }

      if (parent.parentId) {
        throw new BadRequestException(
          "Les réponses imbriquées ne sont pas autorisées pour le moment.",
        );
      }
    }

    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    const isNewAccount = !author || accountAgeDays(author.createdAt) < NEW_ACCOUNT_THRESHOLD_DAYS;
    const contentStatus = isNewAccount ? "PENDING" : "APPROVED";

    const comment = await this.prisma.comment.create({
      data: {
        userId,
        aerodromeId,
        parentId: input.parentId,
        content: input.content,
        contentStatus,
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    await this.audit.log({
      userId,
      action: "COMMENT_CREATE",
      ip,
      metadata: {
        commentId: comment.id,
        aerodromeId,
        parentId: input.parentId ?? null,
        autoModerated: isNewAccount,
      },
    });

    if (isNewAccount) {
      await this.audit.log({
        userId,
        action: "CONTENT_MODERATED",
        ip,
        metadata: {
          reason: "new_account",
          contentType: "comment",
          contentId: comment.id,
          aerodromeId,
        },
      });
    }

    if (input.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: input.parentId },
        select: { userId: true },
      });
      const aerodrome = await this.prisma.aerodrome.findUnique({
        where: { id: aerodromeId },
        select: { name: true },
      });
      if (parent?.userId && parent.userId !== userId) {
        await this.notifications.notifyUser({
          userId: parent.userId,
          type: "COMMENT_REPLY",
          title: "Nouvelle réponse à votre commentaire",
          message: `Un membre a répondu sur ${aerodrome?.name ?? "un aérodrome"}.`,
          linkUrl: `/aerodrome/${aerodromeId}`,
          metadata: {
            aerodromeId,
            commentId: comment.id,
            parentId: input.parentId,
          },
        });
      }
    }

    return comment;
  }

  async getComments(aerodromeId: string, page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          aerodromeId,
          parentId: null,
          deletedAt: null,
          contentStatus: "APPROVED",
        },
        include: {
          user: { select: { id: true, displayName: true } },
          replies: {
            where: {
              deletedAt: null,
              contentStatus: "APPROVED",
            },
            include: {
              user: { select: { id: true, displayName: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.comment.count({
        where: {
          aerodromeId,
          parentId: null,
          deletedAt: null,
          contentStatus: "APPROVED",
        },
      }),
    ]);

    return { data, total };
  }

  async getApprovedCorrections(aerodromeId: string) {
    return this.prisma.correction.findMany({
      where: { aerodromeId, contentStatus: "APPROVED" },
      select: {
        id: true,
        field: true,
        currentValue: true,
        proposedValue: true,
        reason: true,
        createdAt: true,
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async deleteComment(userId: string, commentId: string, role: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        replies: {
          select: { id: true },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException("Commentaire introuvable.");
    }

    if (
      comment.userId !== userId &&
      role !== "ADMIN" &&
      role !== "MODERATOR"
    ) {
      throw new ForbiddenException("Vous ne pouvez pas supprimer ce commentaire.");
    }

    const targetCommentIds = [comment.id, ...comment.replies.map((reply) => reply.id)];

    await this.prisma.$transaction([
      this.prisma.report.deleteMany({
        where: {
          targetType: "comment",
          targetId: { in: targetCommentIds },
        },
      }),
      this.prisma.comment.delete({
        where: { id: commentId },
      }),
    ]);

    await this.audit.log({
      userId,
      action: "COMMENT_DELETE",
      metadata: { commentId },
    });
  }

  async proposeCorrection(
    userId: string,
    aerodromeId: string,
    input: CorrectionCreateInput,
    ip?: string,
  ) {
    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    const ageDays = author ? Math.floor(accountAgeDays(author.createdAt)) : 0;
    const isNewAccount = ageDays < NEW_ACCOUNT_THRESHOLD_DAYS;

    const correction = await this.prisma.correction.create({
      data: {
        userId,
        aerodromeId,
        field: input.field,
        proposedValue: input.proposedValue,
        reason: input.reason,
      },
    });

    await this.audit.log({
      userId,
      action: "CORRECTION_PROPOSE",
      ip,
      metadata: {
        correctionId: correction.id,
        aerodromeId,
        accountAgeDays: ageDays,
        newAccount: isNewAccount,
      },
    });

    if (isNewAccount) {
      await this.audit.log({
        userId,
        action: "CONTENT_MODERATED",
        ip,
        metadata: {
          reason: "new_account",
          contentType: "correction",
          contentId: correction.id,
          aerodromeId,
        },
      });
    }

    return correction;
  }

  async getUpcomingEvents(aerodromeId: string) {
    return this.prisma.aerodromeEvent.findMany({
      where: {
        aerodromeId,
        contentStatus: "APPROVED",
        startDate: { gte: new Date() },
      },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { startDate: "asc" },
    });
  }

  async createEvent(
    userId: string,
    aerodromeId: string,
    input: EventCreateInput,
    ip?: string,
  ) {
    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    const isNewAccount = !author || accountAgeDays(author.createdAt) < NEW_ACCOUNT_THRESHOLD_DAYS;
    const contentStatus = isNewAccount ? "PENDING" : "APPROVED";

    const event = await this.prisma.aerodromeEvent.create({
      data: {
        userId,
        aerodromeId,
        type: input.type,
        title: input.title,
        description: input.description,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        contentStatus,
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    await this.audit.log({
      userId,
      action: "EVENT_CREATE",
      ip,
      metadata: {
        eventId: event.id,
        aerodromeId,
        type: input.type,
        autoModerated: isNewAccount,
      },
    });

    if (isNewAccount) {
      await this.audit.log({
        userId,
        action: "CONTENT_MODERATED",
        ip,
        metadata: {
          reason: "new_account",
          contentType: "event",
          contentId: event.id,
          aerodromeId,
        },
      });
    }

    return event;
  }

  async deleteEvent(userId: string, eventId: string, role: string) {
    const event = await this.prisma.aerodromeEvent.findUnique({
      where: { id: eventId },
      select: { id: true, userId: true },
    });

    if (!event) {
      throw new NotFoundException("Événement introuvable.");
    }

    if (event.userId !== userId && role !== "ADMIN" && role !== "MODERATOR") {
      throw new ForbiddenException("Vous ne pouvez pas supprimer cet événement.");
    }

    await this.prisma.aerodromeEvent.delete({ where: { id: eventId } });

    await this.audit.log({
      userId,
      action: "EVENT_DELETE",
      metadata: { eventId },
    });
  }

  async createReport(
    userId: string,
    aerodromeId: string,
    input: ReportCreateInput,
    ip?: string,
  ) {
    if (input.targetType === "comment") {
      const comment = await this.prisma.comment.findUnique({
        where: { id: input.targetId },
        select: {
          id: true,
          userId: true,
          aerodromeId: true,
          deletedAt: true,
        },
      });

      if (!comment || comment.aerodromeId !== aerodromeId || comment.deletedAt) {
        throw new NotFoundException("Commentaire introuvable.");
      }

      if (comment.userId === userId) {
        throw new BadRequestException("Vous ne pouvez pas signaler votre propre commentaire.");
      }

      const existingPendingReport = await this.prisma.report.findFirst({
        where: {
          userId,
          aerodromeId,
          targetType: "comment",
          targetId: input.targetId,
          contentStatus: "PENDING",
        },
        select: { id: true },
      });

      if (existingPendingReport) {
        throw new BadRequestException("Vous avez déjà signalé ce commentaire.");
      }
    }

    const report = await this.prisma.report.create({
      data: {
        userId,
        aerodromeId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
      },
    });

    if (input.targetType === "comment") {
      await this.prisma.comment.update({
        where: { id: input.targetId },
        data: { contentStatus: "FLAGGED" },
      });
    }

    await this.audit.log({
      userId,
      action: "REPORT_CREATE",
      ip,
      metadata: { reportId: report.id, aerodromeId },
    });

    return report;
  }
}
