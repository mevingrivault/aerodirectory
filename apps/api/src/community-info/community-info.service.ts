import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@aerodirectory/database";
import {
  communityInfoData,
  communityInfoKey,
  type AdminCommunityInfoListItem,
  type AdminCommunityInfosQueryInput,
  type AerodromeCommunityInfo,
  type CommunityInfoCreateInput,
  type CommunityInfoItem,
  type ReviewAdminCommunityInfoInput,
} from "@aerodirectory/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notification/notification.service";

/** Approved entries read per sheet; history beyond that is never shown. */
const MAX_APPROVED_ROWS = 300;

const KIND_LABELS: Record<CommunityInfoItem["kind"], string> = {
  FUEL_PRICE: "prix carburant",
  LANDING_FEE: "taxe d'atterrissage",
  HANGAR: "hangar",
  WEBCAM: "webcam",
};

/**
 * Keeps the first row of each kind and key. Rows must come newest first, so
 * a newer price for 100LL replaces the older one on the sheet.
 */
export function latestPerKey<T extends { kind: string; key: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = `${row.kind}:${row.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

@Injectable()
export class CommunityInfoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async getForAerodrome(aerodromeId: string): Promise<AerodromeCommunityInfo> {
    const [rows, webcams] = await Promise.all([
      this.prisma.communityInfo.findMany({
        where: { aerodromeId, contentStatus: "APPROVED" },
        orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
        take: MAX_APPROVED_ROWS,
        select: {
          id: true,
          kind: true,
          key: true,
          data: true,
          observedAt: true,
          createdAt: true,
          user: { select: { id: true, displayName: true, showCommunityProfile: true } },
        },
      }),
      this.prisma.webcam.findMany({
        where: { aerodromeId },
        orderBy: { label: "asc" },
        select: { id: true, label: true, pageUrl: true, lastImageAt: true },
      }),
    ]);

    return {
      items: latestPerKey(rows).map((row) => ({
        id: row.id,
        kind: row.kind,
        key: row.key,
        data: row.data as Record<string, unknown>,
        observedAt: row.observedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        user: {
          id: row.user.id,
          displayName: row.user.showCommunityProfile ? row.user.displayName : null,
        },
      })),
      webcams: webcams.map((webcam) => ({
        ...webcam,
        lastImageAt: webcam.lastImageAt?.toISOString() ?? null,
      })),
    };
  }

  async propose(userId: string, aerodromeId: string, input: CommunityInfoCreateInput, ip?: string) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: aerodromeId },
      select: { id: true },
    });
    if (!aerodrome) throw new NotFoundException("Aérodrome introuvable.");

    const key = communityInfoKey(input);
    const pending = await this.prisma.communityInfo.findFirst({
      where: { userId, aerodromeId, kind: input.kind, key, contentStatus: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException("Vous avez déjà proposé cette information, elle attend sa validation.");
    }

    const created = await this.prisma.communityInfo.create({
      data: {
        userId,
        aerodromeId,
        kind: input.kind,
        key,
        data: communityInfoData(input) as Prisma.InputJsonValue,
        observedAt: new Date(`${input.observedAt}T00:00:00Z`),
      },
      select: { id: true, kind: true, key: true, contentStatus: true, createdAt: true },
    });

    await this.audit.log({
      userId,
      action: "COMMUNITY_INFO_PROPOSE",
      ip,
      metadata: { communityInfoId: created.id, aerodromeId, kind: input.kind, key },
    });

    return created;
  }

  /**
   * "Still valid": a member saw the same thing again. The newest approved
   * entry is copied with today's date, published at once since nothing but
   * the date changes. Webcams have no date that matters.
   */
  async confirm(userId: string, aerodromeId: string, id: string, ip?: string) {
    const info = await this.prisma.communityInfo.findFirst({
      where: { id, aerodromeId, contentStatus: "APPROVED", kind: { not: "WEBCAM" } },
      select: { id: true, kind: true, key: true, data: true },
    });
    if (!info) throw new NotFoundException("Information introuvable.");

    const latest = await this.prisma.communityInfo.findFirst({
      where: { aerodromeId, kind: info.kind, key: info.key, contentStatus: "APPROVED" },
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, observedAt: true },
    });
    if (latest?.id !== info.id) {
      throw new ConflictException("Une information plus récente a été publiée entre-temps.");
    }
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    if (latest.observedAt.getTime() >= today.getTime()) {
      throw new ConflictException("Cette information a déjà été confirmée aujourd'hui.");
    }

    const created = await this.prisma.communityInfo.create({
      data: {
        userId,
        aerodromeId,
        kind: info.kind,
        key: info.key,
        data: info.data as Prisma.InputJsonValue,
        observedAt: today,
        contentStatus: "APPROVED",
      },
      select: { id: true, observedAt: true },
    });

    await this.audit.log({
      userId,
      action: "COMMUNITY_INFO_PROPOSE",
      ip,
      metadata: { communityInfoId: created.id, aerodromeId, kind: info.kind, key: info.key, confirms: info.id },
    });

    return { id: created.id, observedAt: created.observedAt.toISOString() };
  }

  async listForAdmin(query: AdminCommunityInfosQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const state = query.state ?? "pending";

    const where: Prisma.CommunityInfoWhereInput = {
      ...(state === "pending" ? { contentStatus: "PENDING" as const } : {}),
      ...(state === "approved" ? { contentStatus: "APPROVED" as const } : {}),
      ...(state === "rejected" ? { contentStatus: "REJECTED" as const } : {}),
      ...(search
        ? {
            OR: [
              { key: { contains: search, mode: "insensitive" as const } },
              { aerodrome: { name: { contains: search, mode: "insensitive" as const } } },
              { aerodrome: { icaoCode: { contains: search, mode: "insensitive" as const } } },
              { user: { displayName: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.communityInfo.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true, email: true } },
          aerodrome: { select: { id: true, name: true, icaoCode: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.communityInfo.count({ where }),
    ]);

    const reviewerIds = [...new Set(rows.map((row) => row.reviewedBy).filter((id): id is string => !!id))];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const reviewersById = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer]));

    const data: AdminCommunityInfoListItem[] = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      key: row.key,
      data: row.data as Record<string, unknown>,
      observedAt: row.observedAt.toISOString(),
      contentStatus: row.contentStatus,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedBy: row.reviewedBy ? (reviewersById.get(row.reviewedBy) ?? null) : null,
      aerodrome: row.aerodrome,
      user: row.user,
    }));

    return { data, total };
  }

  async review(
    adminId: string,
    id: string,
    decision: "APPROVED" | "REJECTED",
    input: ReviewAdminCommunityInfoInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const info = await this.prisma.communityInfo.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        aerodromeId: true,
        kind: true,
        key: true,
        contentStatus: true,
        aerodrome: { select: { name: true } },
      },
    });
    if (!info) throw new NotFoundException("Contribution introuvable");
    if (info.contentStatus === decision) {
      throw new BadRequestException(
        decision === "APPROVED" ? "Cette contribution est déjà publiée." : "Cette contribution est déjà rejetée.",
      );
    }

    await this.prisma.communityInfo.update({
      where: { id },
      data: { contentStatus: decision, reviewedBy: adminId, reviewedAt: new Date() },
    });

    const approved = decision === "APPROVED";
    // Same shape as AdminService.logCommunityAdminAction, read by /admin/audit.
    await this.audit.log({
      userId: adminId,
      action: "ADMIN_ACTION",
      ip,
      userAgent,
      metadata: {
        category: "community_content_admin",
        actionType: approved ? "COMMUNITY_INFO_APPROVE" : "COMMUNITY_INFO_REJECT",
        targetType: "community_info",
        targetId: id,
        targetSummary: `${KIND_LABELS[info.kind]}: ${info.key}`.slice(0, 180),
        aerodromeId: info.aerodromeId,
        reason: input.note?.trim() || null,
        communityInfoId: id,
        kind: info.kind,
      },
    });

    await this.notifications.notifyUser({
      userId: info.userId,
      type: approved ? "COMMUNITY_INFO_APPROVED" : "COMMUNITY_INFO_REJECTED",
      title: approved ? "Contribution publiée" : "Contribution non publiée",
      message: approved
        ? `Votre information (${KIND_LABELS[info.kind]}) sur ${info.aerodrome.name} a été publiée.`
        : `Votre information (${KIND_LABELS[info.kind]}) sur ${info.aerodrome.name} n'a pas été publiée.`,
      linkUrl: `/aerodrome/${info.aerodromeId}`,
      metadata: { communityInfoId: id, aerodromeId: info.aerodromeId },
    });
  }
}
