import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AircraftProfileInput,
  PlannerQueryInput,
  PlannerResult,
} from "@aerodirectory/shared";

@Injectable()
export class PlannerService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Aircraft Profiles ──────────────────────────────

  async createProfile(userId: string, input: AircraftProfileInput) {
    return this.prisma.aircraftProfile.create({
      data: { userId, ...input },
    });
  }

  async getProfiles(userId: string) {
    return this.prisma.aircraftProfile.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
  }

  async updateProfile(
    userId: string,
    profileId: string,
    input: Partial<AircraftProfileInput>,
  ) {
    const profile = await this.prisma.aircraftProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) throw new NotFoundException("Profile not found");

    return this.prisma.aircraftProfile.update({
      where: { id: profileId },
      data: input,
    });
  }

  async deleteProfile(userId: string, profileId: string) {
    const profile = await this.prisma.aircraftProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) throw new NotFoundException("Profile not found");

    await this.prisma.aircraftProfile.delete({ where: { id: profileId } });
  }

  // ─── Flight Planning ────────────────────────────────

  async plan(userId: string, input: PlannerQueryInput): Promise<PlannerResult[]> {
    const profile = await this.prisma.aircraftProfile.findFirst({
      where: { id: input.profileId, userId },
    });

    if (!profile) {
      throw new NotFoundException("Aircraft profile not found");
    }

    // Find suitable aerodromes
    const aerodromes = await this.prisma.aerodrome.findMany({
      where: {
        status: "OPEN",
        runways: {
          some: {
            length: { gte: profile.minRunwayLength },
            surface: { in: profile.allowedSurfaces },
          },
        },
      },
      include: {
        runways: true,
      },
    });

    const results: PlannerResult[] = [];

    for (const ad of aerodromes) {
      const distanceNm = haversineNm(
        input.departureLat,
        input.departureLng,
        ad.latitude,
        ad.longitude,
      );

      // Skip if beyond fuel range or max distance
      if (distanceNm > profile.fuelRange) continue;
      if (input.maxDistanceNm && distanceNm > input.maxDistanceNm) continue;

      const timeHours = distanceNm / profile.tas;
      const fuelUsedLiters = timeHours * profile.fuelConsumption;
      const estimatedCost = timeHours * profile.hourlyCost;

      results.push({
        aerodrome: {
          id: ad.id,
          name: ad.name,
          icaoCode: ad.icaoCode,
          latitude: ad.latitude,
          longitude: ad.longitude,
        },
        distanceNm: Math.round(distanceNm * 10) / 10,
        timeHours: Math.round(timeHours * 100) / 100,
        fuelUsedLiters: Math.round(fuelUsedLiters * 10) / 10,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
      });
    }

    // Sort based on preference
    if (input.sortBy === "cost") {
      results.sort((a, b) => a.estimatedCost - b.estimatedCost);
    } else if (input.sortBy === "distance") {
      results.sort((a, b) => a.distanceNm - b.distanceNm);
    } else {
      results.sort((a, b) => a.timeHours - b.timeHours);
    }

    return results;
  }
}

function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065;
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
