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
} from "@aerodirectory/shared";

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
          user: {
            showCommunityContributions: true,
          },
        },
        include: {
          user: {
            select: { id: true, displayName: true, showCommunityProfile: true },
          },
          replies: {
            where: {
              deletedAt: null,
              contentStatus: "APPROVED",
              user: {
                showCommunityContributions: true,
              },
            },
            include: {
              user: {
                select: { id: true, displayName: true, showCommunityProfile: true },
              },
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
          user: {
            showCommunityContributions: true,
          },
        },
      }),
    ]);

    return {
      data: data.map((comment) => ({
        ...comment,
        user: this.toPublicAuthor(comment.user),
        replies: comment.replies.map((reply) => ({
          ...reply,
          user: this.toPublicAuthor(reply.user),
        })),
      })),
      total,
    };
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
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: aerodromeId },
      include: {
        runways: {
          orderBy: [{ mainRunway: "desc" }, { length: "desc" }],
        },
        frequencies: {
          orderBy: [{ isPrimary: "desc" }, { mhz: "asc" }],
        },
        fuels: {
          where: { available: true },
          orderBy: { type: "asc" },
        },
      },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aérodrome introuvable.");
    }

    const correction = await this.prisma.correction.create({
      data: {
        userId,
        aerodromeId,
        field: input.field,
        currentValue: this.resolveAerodromeCurrentValue(aerodrome, input.field),
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
    } else {
      const correction = await this.prisma.correction.findUnique({
        where: { id: input.targetId },
        select: {
          id: true,
          userId: true,
          aerodromeId: true,
          contentStatus: true,
        },
      });

      if (!correction || correction.aerodromeId !== aerodromeId) {
        throw new NotFoundException("Contribution introuvable.");
      }

      if (correction.userId === userId) {
        throw new BadRequestException("Vous ne pouvez pas signaler votre propre contribution.");
      }

      if (correction.contentStatus !== "APPROVED") {
        throw new BadRequestException("Cette contribution n'est pas visible publiquement.");
      }

      const existingPendingReport = await this.prisma.report.findFirst({
        where: {
          userId,
          aerodromeId,
          targetType: "correction",
          targetId: input.targetId,
          contentStatus: "PENDING",
        },
        select: { id: true },
      });

      if (existingPendingReport) {
        throw new BadRequestException("Vous avez déjà signalé cette contribution.");
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

  private resolveAerodromeCurrentValue(
    aerodrome: {
      name: string;
      city: string | null;
      region: string | null;
      department: string | null;
      description: string | null;
      websiteUrl: string | null;
      aipLink: string | null;
      vacLink: string | null;
      ppr: boolean;
      privateUse: boolean;
      nightOperations: boolean;
      hasRestaurant: boolean;
      hasTransport: boolean;
      hasAccommodation: boolean;
      hasMaintenance: boolean;
      hasHangars: boolean;
      runways: { identifier: string; length: number; surface: string }[];
      frequencies: { type: string; mhz: number; callsign: string | null }[];
      fuels: { type: string }[];
    },
    field: string,
  ): string | null {
    const normalizedField = field.trim().toLowerCase();

    switch (normalizedField) {
      case "name":
      case "nom":
        return aerodrome.name;
      case "city":
      case "ville":
        return aerodrome.city;
      case "region":
      case "région":
      case "region/zone":
        return aerodrome.region;
      case "department":
      case "département":
        return aerodrome.department;
      case "description":
        return aerodrome.description;
      case "website":
      case "site":
      case "site web":
      case "websiteurl":
        return aerodrome.websiteUrl;
      case "aip":
      case "aiplink":
        return aerodrome.aipLink;
      case "vac":
      case "vaclink":
        return aerodrome.vacLink;
      case "ppr":
        return aerodrome.ppr ? "Oui" : "Non";
      case "private":
      case "usage privé":
      case "privateuse":
        return aerodrome.privateUse ? "Oui" : "Non";
      case "vols de nuit":
      case "nightoperations":
        return aerodrome.nightOperations ? "Oui" : "Non";
      case "restaurant":
        return aerodrome.hasRestaurant ? "Oui" : "Non";
      case "transport":
        return aerodrome.hasTransport ? "Oui" : "Non";
      case "hébergement":
      case "hebergement":
      case "accommodation":
        return aerodrome.hasAccommodation ? "Oui" : "Non";
      case "maintenance":
        return aerodrome.hasMaintenance ? "Oui" : "Non";
      case "hangars":
        return aerodrome.hasHangars ? "Oui" : "Non";
      case "runway":
      case "runways":
      case "piste":
      case "pistes":
        return aerodrome.runways.length
          ? aerodrome.runways
              .map((runway) => `${runway.identifier} - ${runway.length} m - ${runway.surface}`)
              .join(" | ")
          : null;
      case "frequency":
      case "frequencies":
      case "fréquence":
      case "fréquences":
        return aerodrome.frequencies.length
          ? aerodrome.frequencies
              .map((frequency) =>
                `${frequency.type} ${frequency.mhz}${frequency.callsign ? ` (${frequency.callsign})` : ""}`,
              )
              .join(" | ")
          : null;
      case "fuel":
      case "fuels":
      case "carburant":
      case "carburants":
        return aerodrome.fuels.length ? aerodrome.fuels.map((fuel) => fuel.type).join(", ") : null;
      default:
        return null;
    }
  }

  private toPublicAuthor(user: {
    id: string;
    displayName: string | null;
    showCommunityProfile: boolean;
  }) {
    return {
      id: user.id,
      displayName: user.showCommunityProfile ? user.displayName : null,
    };
  }
}
