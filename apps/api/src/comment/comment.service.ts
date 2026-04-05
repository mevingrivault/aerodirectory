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

  // ─── Comments ────────────────────────────────────────

  async createComment(
    userId: string,
    aerodromeId: string,
    input: CommentCreateInput,
    ip?: string,
  ) {
    const comment = await this.prisma.comment.create({
      data: {
        userId,
        aerodromeId,
        content: input.content,
        contentStatus: "APPROVED", // Auto-approve for now; add moderation later
      },
    });

    await this.audit.log({
      userId,
      action: "COMMENT_CREATE",
      ip,
      metadata: { commentId: comment.id, aerodromeId },
    });

    return comment;
  }

  async getComments(aerodromeId: string, page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          aerodromeId,
          deletedAt: null,
          contentStatus: { in: ["APPROVED", "PENDING"] },
        },
        include: {
          user: { select: { id: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.comment.count({
        where: {
          aerodromeId,
          deletedAt: null,
          contentStatus: { in: ["APPROVED", "PENDING"] },
        },
      }),
    ]);

    return { data, total };
  }

  async deleteComment(userId: string, commentId: string, role: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) throw new NotFoundException("Comment not found");
    if (comment.deletedAt) {
      throw new BadRequestException("Comment already deleted");
    }

    // Only author, moderators, or admins can delete
    if (
      comment.userId !== userId &&
      role !== "ADMIN" &&
      role !== "MODERATOR"
    ) {
      throw new ForbiddenException("Not authorized to delete this comment");
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    await this.audit.log({
      userId,
      action: "COMMENT_DELETE",
      metadata: { commentId },
    });
  }

  // ─── Corrections ─────────────────────────────────────

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

  // ─── Reports ──────────────────────────────────────────

  async createReport(
    userId: string,
    aerodromeId: string,
    input: ReportCreateInput,
    ip?: string,
  ) {
    const report = await this.prisma.report.create({
      data: {
        userId,
        aerodromeId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
      },
    });

    await this.audit.log({
      userId,
      action: "REPORT_CREATE",
      ip,
      metadata: { reportId: report.id, aerodromeId },
    });

    return report;
  }
}
