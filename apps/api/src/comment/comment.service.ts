import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type {
  CommentCreateInput,
  CorrectionCreateInput,
  ReportCreateInput,
} from "@aerodirectory/shared";

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    const comment = await this.prisma.comment.create({
      data: {
        userId,
        aerodromeId,
        parentId: input.parentId,
        content: input.content,
        contentStatus: "APPROVED",
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
      },
    });

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
      metadata: { correctionId: correction.id, aerodromeId },
    });

    return correction;
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
