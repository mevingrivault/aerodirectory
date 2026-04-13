import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import type {
  AdminCommentsQueryInput,
  AdminPhotosQueryInput,
  AdminUsersQueryInput,
  ApproveAdminPhotoInput,
  BanUserInput,
  DeleteAdminCommentInput,
  RejectAdminPhotoInput,
  RestoreAdminCommentInput,
  AdminDashboardStats,
  AdminUserDetail,
  AdminUserListItem,
  AdminCommentListItem,
  AdminPhotoListItem,
} from "@aerodirectory/shared";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const [totalUsers, bannedUsers, activeComments, pendingPhotos] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: "BANNED" } }),
        this.prisma.comment.count({
          where: {
            deletedAt: null,
            contentStatus: { not: "FLAGGED" },
          },
        }),
        this.prisma.photo.count({ where: { status: "PENDING" } }),
      ]);

    return {
      totalUsers,
      bannedUsers,
      activeComments,
      deletedComments: 0,
      pendingPhotos,
    };
  }

  async listUsers(query: AdminUsersQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const status =
      query.status && query.status !== "all" ? query.status : undefined;

    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              {
                displayName: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          bannedBy: {
            select: { id: true, displayName: true, email: true },
          },
          _count: {
            select: { comments: true, visits: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => this.toAdminUserListItem(user)),
      total,
    };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        bannedBy: {
          select: { id: true, displayName: true, email: true },
        },
        homeAerodrome: {
          select: { id: true, name: true, icaoCode: true },
        },
        _count: {
          select: { comments: true, visits: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    return {
      ...this.toAdminUserListItem(user),
      emailVerified: user.emailVerified?.toISOString() ?? null,
      totpEnabled: user.totpEnabled,
      homeAerodrome: user.homeAerodrome ?? null,
    };
  }

  async banUser(
    adminId: string,
    userId: string,
    input: BanUserInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    if (adminId === userId) {
      throw new BadRequestException("Vous ne pouvez pas vous bannir vous-même.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    if (user.role === "ADMIN") {
      throw new BadRequestException(
        "Le bannissement d'un autre administrateur est interdit.",
      );
    }

    if (user.status === "BANNED") {
      throw new BadRequestException("Cet utilisateur est déjà banni.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: "BANNED",
        bannedAt: new Date(),
        bannedReason: input.reason?.trim() || null,
        bannedById: adminId,
      },
    });

    await this.audit.log({
      userId: adminId,
      action: "USER_BAN",
      ip,
      userAgent,
      metadata: {
        targetUserId: userId,
        reason: input.reason?.trim() || null,
      },
    });
  }

  async unbanUser(
    adminId: string,
    userId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    if (user.status !== "BANNED") {
      throw new BadRequestException("Cet utilisateur n'est pas banni.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: "ACTIVE",
        bannedAt: null,
        bannedReason: null,
        bannedById: null,
      },
    });

    await this.audit.log({
      userId: adminId,
      action: "USER_UNBAN",
      ip,
      userAgent,
      metadata: { targetUserId: userId },
    });
  }

  async listComments(query: AdminCommentsQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const state = query.state ?? "active";

    const where = {
      deletedAt: null,
      ...(state === "active"
        ? { contentStatus: { not: "FLAGGED" as const } }
        : state === "reported"
          ? { contentStatus: "FLAGGED" as const }
          : {}),
      ...(search
        ? {
            OR: [
              { content: { contains: search, mode: "insensitive" as const } },
              {
                user: {
                  email: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                user: {
                  displayName: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                aerodrome: {
                  name: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                aerodrome: {
                  icaoCode: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          user: {
            select: { id: true, displayName: true, email: true },
          },
          aerodrome: {
            select: { id: true, name: true, icaoCode: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.comment.count({ where }),
    ]);

    const reports = comments.length
      ? await this.prisma.report.findMany({
          where: {
            targetType: "comment",
            targetId: { in: comments.map((comment) => comment.id) },
            contentStatus: "PENDING",
          },
          select: {
            targetId: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const pendingReportsByComment = new Map<
      string,
      { count: number; reasons: string[] }
    >();

    for (const report of reports) {
      const entry = pendingReportsByComment.get(report.targetId) ?? {
        count: 0,
        reasons: [],
      };
      entry.count += 1;
      if (entry.reasons.length < 3) {
        entry.reasons.push(report.reason);
      }
      pendingReportsByComment.set(report.targetId, entry);
    }

    return {
      data: comments.map((comment) =>
        this.toAdminCommentListItem(
          comment,
          pendingReportsByComment.get(comment.id) ?? { count: 0, reasons: [] },
        ),
      ),
      total,
    };
  }

  async deleteComment(
    adminId: string,
    commentId: string,
    input: DeleteAdminCommentInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        replies: {
          select: { id: true },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException("Commentaire introuvable");
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
      userId: adminId,
      action: "COMMENT_DELETE",
      ip,
      userAgent,
      metadata: {
        commentId,
        reason: input.reason?.trim() || null,
        moderation: true,
      },
    });
  }

  async restoreComment(
    adminId: string,
    commentId: string,
    input: RestoreAdminCommentInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, deletedAt: true, contentStatus: true },
    });

    if (!comment) {
      throw new NotFoundException("Commentaire introuvable");
    }

    if (comment.deletedAt) {
      throw new BadRequestException("Un commentaire supprimé ne peut pas être rétabli.");
    }

    if (comment.contentStatus !== "FLAGGED") {
      throw new BadRequestException("Ce commentaire n'est pas en attente de modération.");
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { contentStatus: "APPROVED" },
    });

    await this.prisma.report.updateMany({
      where: {
        targetType: "comment",
        targetId: commentId,
        contentStatus: "PENDING",
      },
      data: {
        contentStatus: "REJECTED",
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.audit.log({
      userId: adminId,
      action: "ADMIN_ACTION",
      ip,
      userAgent,
      metadata: {
        type: "COMMENT_RESTORE",
        commentId,
        note: input.note?.trim() || null,
      },
    });
  }

  async sendTestEmail(
    adminId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, displayName: true, role: true },
    });

    if (!admin || admin.role !== "ADMIN") {
      throw new NotFoundException("Administrateur introuvable");
    }

    const result = await this.mail.sendAdminTestEmail(admin.email, {
      requestedBy: admin.displayName || admin.email,
    });

    await this.audit.log({
      userId: adminId,
      action: "ADMIN_ACTION",
      ip,
      userAgent,
      metadata: {
        type: "MAIL_TEST_SEND",
        to: admin.email,
        messageId: result.messageId,
        smtpVerified: result.diagnostics.verified,
      },
    });

    return {
      sentTo: admin.email,
      messageId: result.messageId,
      diagnostics: result.diagnostics,
    };
  }

  async buildMailDiagnosticsReport(adminId: string) {
    const [admin, diagnostics, recentRuns, recentAuditLogs, activeTokens, unusedVerifyTokens, unusedResetTokens] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: adminId },
          select: { email: true, displayName: true },
        }),
        this.mail.getDiagnosticsSnapshot(),
        this.prisma.syncRun.findMany({
          take: 10,
          orderBy: [{ createdAt: "desc" }],
          select: {
            source: true,
            status: true,
            runType: true,
            scheduledFor: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            errorMessage: true,
            summary: true,
          },
        }),
        this.prisma.auditLog.findMany({
          where: {
            action: "ADMIN_ACTION",
            metadata: {
              path: ["type"],
              equals: "MAIL_TEST_SEND",
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            createdAt: true,
            metadata: true,
          },
        }),
        this.prisma.emailToken.count({
          where: { usedAt: null, expiresAt: { gt: new Date() } },
        }),
        this.prisma.emailToken.count({
          where: {
            type: "verify",
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
        this.prisma.emailToken.count({
          where: {
            type: "reset",
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
      ]);

    const lines: string[] = [
      "Navventura - Mail diagnostics",
      `Generated at: ${new Date().toISOString()}`,
      `Requested by: ${admin?.displayName || admin?.email || adminId}`,
      "",
      "[SMTP]",
      `Host: ${diagnostics.host}`,
      `Port: ${diagnostics.port}`,
      `Secure: ${diagnostics.secure ? "true" : "false"}`,
      `From: ${diagnostics.from}`,
      `App URL: ${diagnostics.appUrl}`,
      `User: ${diagnostics.user ?? "none"}`,
      `Verify checked at: ${diagnostics.checkedAt}`,
      `Verify result: ${diagnostics.verified ? "OK" : "FAILED"}`,
      `Verify error: ${diagnostics.verifyError ?? "none"}`,
      "",
      "[Email tokens]",
      `Active tokens: ${activeTokens}`,
      `Active verify tokens: ${unusedVerifyTokens}`,
      `Active reset tokens: ${unusedResetTokens}`,
      "",
      "[Recent sync runs]",
    ];

    for (const run of recentRuns) {
      lines.push(
        `- ${run.source} | ${run.status} | ${run.runType} | scheduled=${run.scheduledFor.toISOString()} | started=${run.startedAt?.toISOString() ?? "null"} | finished=${run.finishedAt?.toISOString() ?? "null"} | durationMs=${run.durationMs ?? "null"} | error=${run.errorMessage ?? "none"} | summary=${JSON.stringify(run.summary ?? {})}`,
      );
    }

    lines.push("", "[Recent admin mail tests]");
    for (const auditLog of recentAuditLogs) {
      lines.push(
        `- ${auditLog.createdAt.toISOString()} | ${JSON.stringify(auditLog.metadata ?? {})}`,
      );
    }

    await this.audit.log({
      userId: adminId,
      action: "ADMIN_ACTION",
      metadata: {
        type: "MAIL_DIAGNOSTICS_DOWNLOAD",
      },
    });

    return lines.join("\n");
  }

  async listPhotos(query: AdminPhotosQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const state = query.state ?? "pending";

    const where = {
      ...(state === "pending"
        ? { status: "PENDING" as const }
        : state === "approved"
          ? { status: "READY" as const }
          : state === "rejected"
            ? { status: "REJECTED" as const }
            : {}),
      ...(search
        ? {
            OR: [
              {
                user: {
                  email: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                user: {
                  displayName: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                aerodrome: {
                  name: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                aerodrome: {
                  icaoCode: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [photos, total] = await Promise.all([
      this.prisma.photo.findMany({
        where,
        include: {
          user: {
            select: { id: true, displayName: true, email: true },
          },
          aerodrome: {
            select: { id: true, name: true, icaoCode: true },
          },
          reviewedBy: {
            select: { id: true, displayName: true, email: true },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.photo.count({ where }),
    ]);

    return {
      data: photos.map((photo) => this.toAdminPhotoListItem(photo)),
      total,
    };
  }

  async getPhotoFile(photoId: string) {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      select: { id: true, storedKey: true, mimeType: true },
    });

    if (!photo) {
      throw new NotFoundException("Photo introuvable");
    }

    return photo;
  }

  async approvePhoto(
    adminId: string,
    photoId: string,
    input: ApproveAdminPhotoInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      select: { id: true, status: true, aerodromeId: true },
    });

    if (!photo) {
      throw new NotFoundException("Photo introuvable");
    }

    if (photo.status !== "PENDING") {
      throw new BadRequestException("Cette photo n'est pas en attente de validation.");
    }

    await this.prisma.photo.update({
      where: { id: photoId },
      data: {
        status: "READY",
        rejectedReason: null,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    await this.audit.log({
      userId: adminId,
      action: "PHOTO_APPROVE",
      ip,
      userAgent,
      metadata: {
        photoId,
        aerodromeId: photo.aerodromeId,
        note: input.note?.trim() || null,
      },
    });
  }

  async rejectPhoto(
    adminId: string,
    photoId: string,
    input: RejectAdminPhotoInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      select: { id: true, status: true, aerodromeId: true },
    });

    if (!photo) {
      throw new NotFoundException("Photo introuvable");
    }

    if (photo.status !== "PENDING") {
      throw new BadRequestException("Cette photo n'est pas en attente de validation.");
    }

    await this.prisma.photo.update({
      where: { id: photoId },
      data: {
        status: "REJECTED",
        rejectedReason: input.reason?.trim() || null,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    await this.audit.log({
      userId: adminId,
      action: "PHOTO_REJECT",
      ip,
      userAgent,
      metadata: {
        photoId,
        aerodromeId: photo.aerodromeId,
        reason: input.reason?.trim() || null,
      },
    });
  }

  private toAdminUserListItem(user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    status: "ACTIVE" | "BANNED";
    bannedAt: Date | null;
    bannedReason: string | null;
    bannedBy?: { id: string; displayName: string | null; email: string } | null;
    createdAt: Date;
    _count: { comments: number; visits: number };
  }): AdminUserListItem {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      bannedAt: user.bannedAt?.toISOString() ?? null,
      bannedReason: user.bannedReason,
      bannedBy: user.bannedBy ?? null,
      createdAt: user.createdAt.toISOString(),
      _count: user._count,
    };
  }

  private toAdminCommentListItem(
    comment: {
      id: string;
      content: string;
      contentStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
      createdAt: Date;
      aerodrome: { id: string; name: string; icaoCode: string | null };
      user: { id: string; displayName: string | null; email: string };
    },
    pendingReports: { count: number; reasons: string[] },
  ): AdminCommentListItem {
    return {
      id: comment.id,
      content: comment.content,
      contentStatus: comment.contentStatus,
      createdAt: comment.createdAt.toISOString(),
      deletedAt: null,
      deletedReason: null,
      aerodrome: comment.aerodrome,
      user: comment.user,
      deletedBy: null,
      pendingReports,
    };
  }

  private toAdminPhotoListItem(photo: {
    id: string;
    status: "PENDING" | "SCANNING" | "REJECTED" | "READY";
    createdAt: Date;
    reviewedAt: Date | null;
    rejectedReason: string | null;
    mimeType: string;
    width: number | null;
    height: number | null;
    aerodrome: { id: string; name: string; icaoCode: string | null };
    user: { id: string; displayName: string | null; email: string };
    reviewedBy?: { id: string; displayName: string | null; email: string } | null;
  }): AdminPhotoListItem {
    return {
      id: photo.id,
      status: photo.status,
      createdAt: photo.createdAt.toISOString(),
      reviewedAt: photo.reviewedAt?.toISOString() ?? null,
      rejectedReason: photo.rejectedReason,
      mimeType: photo.mimeType,
      width: photo.width,
      height: photo.height,
      aerodrome: photo.aerodrome,
      user: photo.user,
      reviewedBy: photo.reviewedBy ?? null,
    };
  }
}
