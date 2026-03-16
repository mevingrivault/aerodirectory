import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AerodromeCreateInput,
  AerodromeUpdateInput,
} from "@aerodirectory/shared";

@Injectable()
export class AerodromeService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
        _count: { select: { visits: true, comments: true } },
      },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    return aerodrome;
  }

  async findByIcao(icaoCode: string) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { icaoCode },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
        _count: { select: { visits: true, comments: true } },
      },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    return aerodrome;
  }

  async findNearby(lat: number, lng: number, radiusKm: number, limit: number) {
    // Bounding-box pre-filter
    const kmPerDegLat = 111.0;
    const kmPerDegLng = 111.0 * Math.cos((lat * Math.PI) / 180);
    const latDelta = radiusKm / kmPerDegLat;
    const lngDelta = radiusKm / kmPerDegLng;

    const candidates = await this.prisma.aerodrome.findMany({
      where: {
        latitude: { gte: lat - latDelta, lte: lat + latDelta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      include: {
        runways: true,
        frequencies: true,
        _count: { select: { visits: true, comments: true } },
      },
    });

    // Haversine post-filter and sort
    const withDistance = candidates
      .map((a) => ({
        ...a,
        distanceKm: haversineKm(lat, lng, a.latitude, a.longitude),
      }))
      .filter((a) => a.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return withDistance;
  }

  async create(input: AerodromeCreateInput) {
    const { runways, frequencies, fuels, ...data } = input;

    return this.prisma.aerodrome.create({
      data: {
        ...data,
        runways: runways ? { create: runways } : undefined,
        frequencies: frequencies ? { create: frequencies } : undefined,
        fuels: fuels ? { create: fuels } : undefined,
      },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
      },
    });
  }

  async update(id: string, input: AerodromeUpdateInput) {
    // Verify exists
    await this.findById(id);

    const { runways, frequencies, fuels, ...data } = input;

    return this.prisma.aerodrome.update({
      where: { id },
      data: {
        ...data,
        // For nested updates, replace all related records
        ...(runways && {
          runways: {
            deleteMany: {},
            create: runways,
          },
        }),
        ...(frequencies && {
          frequencies: {
            deleteMany: {},
            create: frequencies,
          },
        }),
        ...(fuels && {
          fuels: {
            deleteMany: {},
            create: fuels,
          },
        }),
      },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.aerodrome.delete({ where: { id } });
  }

  async list(page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.prisma.aerodrome.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          runways: true,
          _count: { select: { visits: true, comments: true } },
        },
      }),
      this.prisma.aerodrome.count(),
    ]);

    return { data, total };
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
