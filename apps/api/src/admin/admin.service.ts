import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type {
  AdminCommentsQueryInput,
  AdminUsersQueryInput,
  BanUserInput,
  DeleteAdminCommentInput,
  AdminDashboardStats,
  AdminUserDetail,
  AdminUserListItem,
  AdminCommentListItem,
} from "@aerodirectory/shared";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const [totalUsers, bannedUsers, activeComments, deletedComments] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: "BANNED" } }),
        this.prisma.comment.count({ where: { deletedAt: null } }),
        this.prisma.comment.count({ where: { deletedAt: { not: null } } }),
      ]);

    return { totalUsers, bannedUsers, activeComments, deletedComments };
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
      ...(state === "active"
        ? { deletedAt: null }
        : state === "deleted"
          ? { deletedAt: { not: null as Date | null } }
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
          deletedBy: {
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

    return {
      data: comments.map((comment) => this.toAdminCommentListItem(comment)),
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
      select: { id: true, deletedAt: true },
    });

    if (!comment) {
      throw new NotFoundException("Commentaire introuvable");
    }

    if (comment.deletedAt) {
      throw new BadRequestException("Ce commentaire est déjà supprimé.");
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedReason: input.reason?.trim() || null,
        deletedById: adminId,
      },
    });

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

  private toAdminCommentListItem(comment: {
    id: string;
    content: string;
    createdAt: Date;
    deletedAt: Date | null;
    deletedReason: string | null;
    aerodrome: { id: string; name: string; icaoCode: string | null };
    user: { id: string; displayName: string | null; email: string };
    deletedBy?: { id: string; displayName: string | null; email: string } | null;
  }): AdminCommentListItem {
    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      deletedAt: comment.deletedAt?.toISOString() ?? null,
      deletedReason: comment.deletedReason,
      aerodrome: comment.aerodrome,
      user: comment.user,
      deletedBy: comment.deletedBy ?? null,
    };
  }
}
