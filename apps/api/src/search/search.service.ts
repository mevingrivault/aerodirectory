import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  haversineKm,
  type AerodromeSearchInput,
  type PublicSavedSearchListQueryInput,
  type SavedSearchCreateInput,
  type SavedSearchVisibilityInput,
} from "@aerodirectory/shared";
import { Prisma } from "@aerodirectory/database";
import { StorageService } from "../photo/storage.service";

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listSavedSearches(userId: string, scope: "search" | "planner") {
    const saved = await this.prisma.savedSearch.findMany({
      where: { userId, scope },
      orderBy: { updatedAt: "desc" },
    });

    return saved.map((item) => ({
      id: item.id,
      name: item.name,
      scope: item.scope as "search" | "planner",
      isPublic: item.isPublic,
      params: (item.params as Record<string, string>) ?? {},
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }

  async createSavedSearch(userId: string, input: SavedSearchCreateInput) {
    const currentCount = await this.prisma.savedSearch.count({
      where: { userId, scope: input.scope },
    });
    if (currentCount >= 50) {
      throw new BadRequestException("Vous avez atteint la limite de 50 recherches sauvegardées.");
    }

    const created = await this.prisma.savedSearch.create({
      data: {
        userId,
        name: input.name.trim(),
        scope: input.scope,
        isPublic: input.isPublic ?? false,
        params: input.params,
      },
    });

    return {
      id: created.id,
      name: created.name,
      scope: created.scope as "search" | "planner",
      isPublic: created.isPublic,
      params: (created.params as Record<string, string>) ?? {},
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateSavedSearchVisibility(
    userId: string,
    id: string,
    input: SavedSearchVisibilityInput,
  ) {
    const existing = await this.prisma.savedSearch.findUnique({
      where: { id },
      select: { id: true, userId: true, scope: true, name: true, params: true, createdAt: true, updatedAt: true },
    });

    if (!existing) {
      throw new NotFoundException("Recherche sauvegardée introuvable");
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException("Accès refusé");
    }

    const updated = await this.prisma.savedSearch.update({
      where: { id },
      data: { isPublic: input.isPublic },
    });

    return {
      id: updated.id,
      name: updated.name,
      scope: updated.scope as "search" | "planner",
      isPublic: updated.isPublic,
      params: (updated.params as Record<string, string>) ?? {},
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async listPublicSavedSearches(
    userId: string,
    query: PublicSavedSearchListQueryInput,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        avatarKey: true,
        showCommunityProfile: true,
        showPublicSearches: true,
      },
    });

    if (!user || !user.showCommunityProfile || !user.showPublicSearches || !user.displayName) {
      throw new NotFoundException("Historique public introuvable");
    }

    const saved = await this.prisma.savedSearch.findMany({
      where: {
        userId,
        isPublic: true,
        ...(query.scope ? { scope: query.scope } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });

    return saved.map((item) => ({
      id: item.id,
      name: item.name,
      scope: item.scope as "search" | "planner",
      isPublic: item.isPublic,
      params: (item.params as Record<string, string>) ?? {},
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      user: {
        id: user.id,
        displayName: user.displayName!,
        avatarUrl: this.storage.resolveAvatarUrl(user.id, user.avatarKey),
      },
    }));
  }

  async listSimilarPublicSearches(userId: string) {
    const sourceSearches = await this.prisma.savedSearch.findMany({
      where: { userId, isPublic: true },
      select: {
        scope: true,
        params: true,
      },
      take: 8,
    });

    if (sourceSearches.length === 0) {
      return [];
    }

    const candidates = await this.prisma.savedSearch.findMany({
      where: {
        userId: { not: userId },
        isPublic: true,
        user: {
          showCommunityProfile: true,
          showPublicSearches: true,
          displayName: { not: null },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarKey: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 60,
    });

    const scored = candidates
      .map((candidate) => {
        const candidateParams = (candidate.params as Record<string, string>) ?? {};
        const score = sourceSearches.reduce((bestScore, source) => {
          if (source.scope !== candidate.scope) {
            return bestScore;
          }

          const sourceParams = (source.params as Record<string, string>) ?? {};
          let overlap = 0;

          for (const [key, value] of Object.entries(candidateParams)) {
            if (value && sourceParams[key] === value) {
              overlap += 1;
            }
          }

          return Math.max(bestScore, overlap);
        }, 0);

        return { candidate, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.candidate.updatedAt.getTime() - left.candidate.updatedAt.getTime())
      .slice(0, 6);

    return scored.map(({ candidate }) => ({
      id: candidate.id,
      name: candidate.name,
      scope: candidate.scope as "search" | "planner",
      isPublic: candidate.isPublic,
      params: (candidate.params as Record<string, string>) ?? {},
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
      user: {
        id: candidate.user.id,
        displayName: candidate.user.displayName!,
        avatarUrl: this.storage.resolveAvatarUrl(candidate.user.id, candidate.user.avatarKey),
      },
    }));
  }

  async deleteSavedSearch(userId: string, id: string) {
    const existing = await this.prisma.savedSearch.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!existing) {
      throw new NotFoundException("Recherche sauvegardée introuvable");
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException("Accès refusé");
    }

    await this.prisma.savedSearch.delete({ where: { id } });
  }

  async search(input: AerodromeSearchInput) {
    const { q, page, limit, sortBy, lat, lng, radiusKm, ...filters } = input;

    // Build WHERE conditions
    const where: Prisma.AerodromeWhereInput = {};

    // Full-text search on name, icaoCode, city
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { icaoCode: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
      ];
    }

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Aerodrome type filter
    if (filters.aerodromeType) {
      where.aerodromeType = filters.aerodromeType;
    }

    // Amenity filters
    if (filters.hasRestaurant !== undefined) {
      where.hasRestaurant = filters.hasRestaurant;
    }
    if (filters.hasAccommodation !== undefined) {
      where.hasAccommodation = filters.hasAccommodation;
    }
    if (filters.hasBikes !== undefined) {
      where.hasBikes = filters.hasBikes;
    }
    if (filters.hasTransport !== undefined) {
      where.hasTransport = filters.hasTransport;
    }
    if (filters.nightOperations !== undefined) {
      where.nightOperations = filters.nightOperations;
    }
    if (filters.ppr !== undefined) {
      where.ppr = filters.ppr;
    }
    if (filters.privateUse !== undefined) {
      where.privateUse = filters.privateUse;
    }
    if (filters.skydiveActivity !== undefined) {
      where.skydiveActivity = filters.skydiveActivity;
    }
    if (filters.winchOnly !== undefined) {
      where.winchOnly = filters.winchOnly;
    }

    // Runway filters (length, surface)
    if (filters.minRunwayLength || filters.surface) {
      where.runways = {
        some: {
          ...(filters.minRunwayLength && {
            length: { gte: filters.minRunwayLength },
          }),
          ...(filters.surface && { surface: filters.surface }),
        },
      };
    }

    // Fuel filter
    if (filters.fuel) {
      where.fuels = {
        some: {
          type: filters.fuel,
          available: true,
        },
      };
    }

    // Geospatial filter — use Haversine approximation via raw SQL
    // For PostGIS, we'd use ST_DWithin, but for Prisma compatibility
    // we use a bounding box pre-filter + Haversine post-filter
    if (lat !== undefined && lng !== undefined && radiusKm) {
      const kmPerDegLat = 111.0;
      const kmPerDegLng = 111.0 * Math.cos((lat * Math.PI) / 180);
      const latDelta = radiusKm / kmPerDegLat;
      const lngDelta = radiusKm / kmPerDegLng;

      where.latitude = {
        gte: lat - latDelta,
        lte: lat + latDelta,
      };
      where.longitude = {
        gte: lng - lngDelta,
        lte: lng + lngDelta,
      };
    }

    // Determine ordering
    let orderBy: Prisma.AerodromeOrderByWithRelationInput = { name: "asc" };
    if (sortBy === "icaoCode") {
      orderBy = { icaoCode: "asc" };
    } else if (sortBy === "city") {
      orderBy = { city: "asc" };
    }
    // For distance sorting, we sort in-memory after query

    const include = {
      runways: true,
      fuels: { where: { available: true } },
      _count: {
        select: {
          visits: true,
          comments: {
            where: {
              deletedAt: null,
              contentStatus: "APPROVED" as const,
              user: { showCommunityContributions: true },
            },
          },
        },
      },
    };

    // Distance sort: rank on a lightweight projection (id + coordinates),
    // then load the full rows for the requested page only.
    if (sortBy === "distance" && lat !== undefined && lng !== undefined) {
      const candidates = await this.prisma.aerodrome.findMany({
        where,
        select: { id: true, latitude: true, longitude: true },
      });

      const ranked = candidates
        .map((a) => ({ id: a.id, distanceKm: haversineKm(lat, lng, a.latitude, a.longitude) }))
        .sort((a, b) => a.distanceKm - b.distanceKm);

      const pageIds = ranked.slice((page - 1) * limit, page * limit);
      const rows = pageIds.length
        ? await this.prisma.aerodrome.findMany({
            where: { id: { in: pageIds.map((r) => r.id) } },
            include,
          })
        : [];
      const rowsById = new Map(rows.map((row) => [row.id, row]));

      const data = pageIds
        .map((r) => {
          const row = rowsById.get(r.id);
          return row ? { ...row, distanceKm: r.distanceKm } : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      return { data, total: ranked.length };
    }

    const [rawData, total] = await Promise.all([
      this.prisma.aerodrome.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include,
      }),
      this.prisma.aerodrome.count({ where }),
    ]);

    return { data: rawData, total };
  }
}

