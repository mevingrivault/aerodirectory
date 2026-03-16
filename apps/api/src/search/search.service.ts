import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AerodromeSearchInput } from "@aerodirectory/shared";
import { Prisma } from "@aerodirectory/database";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (filters.nightOperations !== undefined) {
      where.nightOperations = filters.nightOperations;
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
