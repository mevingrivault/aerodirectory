import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CacheService } from "../common/cache.service";
import { Prisma } from "@aerodirectory/database";
import { distanceToArea, type AreaGeometry } from "../services/importers/ign/protected-areas.geometry";
import {
  haversineKm,
  type AerodromeCreateInput,
  type AerodromeUpdateInput,
} from "@aerodirectory/shared";

/** Sheets created through the API carry this source; imported ones carry the importer's name. */
export const MANUAL_SOURCE = "manual";

/** Initial great-circle bearing from A to B, in whole degrees true (0–359). */
export function initialBearing(latA: number, lonA: number, latB: number, lonB: number): number {
  const rad = Math.PI / 180;
  const φ1 = latA * rad;
  const φ2 = latB * rad;
  const Δλ = (lonB - lonA) * rad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.round(((Math.atan2(y, x) / rad) + 360) % 360) % 360;
}

export interface AdminActor {
  adminId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AerodromeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  /** The full marker set changes once a night; every map load asks for it. */
  private static readonly MARKERS_CACHE_KEY = "aerodromes:markers:v1";
  private static readonly MARKERS_CACHE_TTL_SECONDS = 60 * 60;

  async findById(id: string) {
    return this.findOne({ id });
  }

  /**
   * Obstacles within `radiusMeters` of the aerodrome reference point,
   * nearest first, with distance and true bearing from the aerodrome.
   */
  async findObstaclesNear(id: string, radiusMeters: number) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id },
      select: { latitude: true, longitude: true },
    });
    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    const { latitude: lat, longitude: lon } = aerodrome;
    const dLat = radiusMeters / 111_320;
    const dLon = radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    const candidates = await this.prisma.obstacle.findMany({
      where: {
        latitude: { gte: lat - dLat, lte: lat + dLat },
        longitude: { gte: lon - dLon, lte: lon + dLon },
      },
      select: { id: true, name: true, type: true, latitude: true, longitude: true, heightM: true, elevationM: true },
    });

    return candidates
      .map((o) => ({
        ...o,
        distanceM: Math.round(haversineKm(lat, lon, o.latitude, o.longitude) * 1000),
        bearingDeg: initialBearing(lat, lon, o.latitude, o.longitude),
      }))
      .filter((o) => o.distanceM <= radiusMeters)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, AerodromeService.MAX_OBSTACLES);
  }

  private static readonly MAX_OBSTACLES = 500;

  /**
   * Protected areas within `radiusMeters` of the aerodrome reference point
   * (0 m when it lies inside one), nearest first, with their geometry.
   */
  async findProtectedAreasNear(id: string, radiusMeters: number) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id },
      select: { latitude: true, longitude: true },
    });
    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    const { latitude: lat, longitude: lon } = aerodrome;
    const dLat = radiusMeters / 111_320;
    const dLon = radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    // Areas whose bounding box meets the search box; the exact distance sorts them out.
    const candidates = await this.prisma.protectedArea.findMany({
      where: {
        minLat: { lte: lat + dLat },
        maxLat: { gte: lat - dLat },
        minLon: { lte: lon + dLon },
        maxLon: { gte: lon - dLon },
      },
      select: { id: true, name: true, kind: true, detail: true, geometry: true },
    });

    return candidates
      .map((area) => ({ ...area, distanceM: distanceToArea(lat, lon, area.geometry as unknown as AreaGeometry) }))
      .filter((area) => area.distanceM <= radiusMeters)
      .sort((a, b) => a.distanceM - b.distanceM);
  }

  async findByIcao(icaoCode: string) {
    return this.findOne({ icaoCode });
  }

  /** Full sheet: source data plus the approved community corrections shown alongside it. */
  private async findOne(where: Prisma.AerodromeWhereUniqueInput) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where,
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
        commonsPhoto: {
          select: { author: true, license: true, licenseUrl: true, pageUrl: true, width: true, height: true, updatedAt: true },
        },
        corrections: {
          where: {
            contentStatus: "APPROVED",
            user: { showCommunityContributions: true },
          },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                showCommunityProfile: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            visits: true,
            comments: {
              where: {
                deletedAt: null,
                contentStatus: "APPROVED",
                user: { showCommunityContributions: true },
              },
            },
          },
        },
      },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    return {
      ...aerodrome,
      corrections: aerodrome.corrections.map((correction) => ({
        ...correction,
        user: {
          id: correction.user.id,
          displayName: correction.user.showCommunityProfile
            ? correction.user.displayName
            : null,
        },
      })),
    };
  }

  async findNearby(lat: number, lng: number, radiusKm: number, limit: number, hasFuel?: boolean) {
    // Bounding-box pre-filter
    const kmPerDegLat = 111.0;
    const kmPerDegLng = 111.0 * Math.cos((lat * Math.PI) / 180);
    const latDelta = radiusKm / kmPerDegLat;
    const lngDelta = radiusKm / kmPerDegLng;

    const candidates = await this.prisma.aerodrome.findMany({
      where: {
        latitude: { gte: lat - latDelta, lte: lat + latDelta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
        ...(hasFuel ? { fuels: { some: { available: true } } } : {}),
      },
      include: {
        runways: true,
        frequencies: true,
        fuels: { select: { type: true, available: true } },
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

  async create(input: AerodromeCreateInput, actor: AdminActor) {
    const { runways, frequencies, fuels, ...data } = input;

    const created = await this.prisma.aerodrome.create({
      data: {
        ...data,
        source: MANUAL_SOURCE,
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

    await this.audit.log({
      userId: actor.adminId,
      action: "ADMIN_ACTION",
      ip: actor.ip,
      userAgent: actor.userAgent,
      metadata: { type: "AERODROME_CREATE", aerodromeId: created.id, name: created.name },
    });

    return created;
  }

  /**
   * Imported sheets are owned by their importer: editing them here would be
   * silently undone by the next sync, so the API refuses. Only manual sheets
   * can be changed or removed.
   */
  private async assertEditable(id: string) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id },
      select: { id: true, name: true, source: true },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    if (aerodrome.source && aerodrome.source !== MANUAL_SOURCE) {
      throw new ConflictException(
        `Cette fiche est importée depuis ${aerodrome.source} : elle ne peut pas être modifiée manuellement, la prochaine synchronisation l'écraserait. Proposez une correction ou corrigez la source.`,
      );
    }

    return aerodrome;
  }

  async update(id: string, input: AerodromeUpdateInput, actor: AdminActor) {
    await this.assertEditable(id);

    const { runways, frequencies, fuels, ...data } = input;

    const updated = await this.prisma.aerodrome.update({
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

    await this.audit.log({
      userId: actor.adminId,
      action: "ADMIN_ACTION",
      ip: actor.ip,
      userAgent: actor.userAgent,
      metadata: {
        type: "AERODROME_UPDATE",
        aerodromeId: id,
        fields: Object.keys(input),
      },
    });

    return updated;
  }

  async delete(id: string, actor: AdminActor) {
    const aerodrome = await this.assertEditable(id);

    await this.prisma.aerodrome.delete({ where: { id } });

    await this.audit.log({
      userId: actor.adminId,
      action: "ADMIN_ACTION",
      ip: actor.ip,
      userAgent: actor.userAgent,
      metadata: { type: "AERODROME_DELETE", aerodromeId: id, name: aerodrome.name },
    });
  }

  async findAllMarkers(q?: string) {
    const query = q?.trim();
    if (!query) {
      return this.cache.getOrSet(
        AerodromeService.MARKERS_CACHE_KEY,
        AerodromeService.MARKERS_CACHE_TTL_SECONDS,
        () => this.queryMarkers(),
      );
    }
    return this.queryMarkers(query);
  }

  private queryMarkers(q?: string) {
    const where: Prisma.AerodromeWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { icaoCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    return this.prisma.aerodrome.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        icaoCode: true,
        iataCode: true,
        latitude: true,
        longitude: true,
        aerodromeType: true,
        status: true,
        elevation: true,
        hasRestaurant: true,
        hasMaintenance: true,
        runways: {
          select: { identifier: true, length: true, surface: true },
        },
        fuels: {
          select: { type: true },
        },
      },
    });
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

  async stats() {
    const [total, ulm, seaplane] = await Promise.all([
      this.prisma.aerodrome.count({ where: { countryCode: "FR" } }),
      this.prisma.aerodrome.count({
        where: { countryCode: "FR", aerodromeType: "ULTRALIGHT_FIELD" },
      }),
      this.prisma.aerodrome.count({
        where: { countryCode: "FR", aerodromeType: "SEAPLANE_BASE" },
      }),
    ]);
    return { total, ulmAndSeaplane: ulm + seaplane };
  }

  async featured(limit = 3) {
    return this.prisma.aerodrome.findMany({
      where: {
        countryCode: "FR",
        status: "OPEN",
        hasRestaurant: true,
        icaoCode: { not: null },
      },
      orderBy: { visits: { _count: "desc" } },
      take: limit,
      include: {
        runways: { select: { length: true }, orderBy: { length: "desc" }, take: 1 },
        fuels: { select: { type: true, available: true }, where: { available: true } },
      },
    });
  }
}

