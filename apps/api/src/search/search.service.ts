import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type {
  AerodromeSearchInput,
  SavedSearchCreateInput,
} from "@aerodirectory/shared";
import { Prisma } from "@aerodirectory/database";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async listSavedSearches(userId: string, scope: "search" | "planner") {
    const saved = await this.prisma.savedSearch.findMany({
      where: { userId, scope },
      orderBy: { updatedAt: "desc" },
    });

    return saved.map((item) => ({
      id: item.id,
      name: item.name,
      scope: item.scope as "search" | "planner",
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
        params: input.params,
      },
    });

    return {
      id: created.id,
      name: created.name,
      scope: created.scope as "search" | "planner",
      params: (created.params as Record<string, string>) ?? {},
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
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

    const [rawData, total] = await Promise.all([
      this.prisma.aerodrome.findMany({
        where,
        skip: sortBy === "distance" ? 0 : (page - 1) * limit,
        take: sortBy === "distance" ? undefined : limit,
        orderBy,
        include: {
          runways: true,
          fuels: { where: { available: true } },
          _count: { select: { visits: true, comments: true } },
        },
      }),
      this.prisma.aerodrome.count({ where }),
    ]);

    // If distance sort requested, compute distances and sort
    if (
      sortBy === "distance" &&
      lat !== undefined &&
      lng !== undefined
    ) {
      const withDistance = rawData.map((a) => ({
        ...a,
        distanceKm: haversineKm(lat, lng, a.latitude, a.longitude),
      }));
      withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
      const paged = withDistance.slice((page - 1) * limit, page * limit);
      return { data: paged, total };
    }

    return { data: rawData, total };
  }
}

/** Haversine distance in km */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
