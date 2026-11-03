import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AircraftProfileInput,
  PlannerQueryInput,
  PlannerResult,
} from "@aerodirectory/shared";
import { buildDestinationWhere, estimateLeg } from "./planner.calc";

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
    if (!profile) throw new NotFoundException("Aircraft profile not found");

    const aerodromes = await this.prisma.aerodrome.findMany({
      where: buildDestinationWhere(profile, input, userId),
      include: {
        runways: { select: { length: true } },
        fuels: { where: { available: true }, select: { type: true } },
      },
    });

    const results: PlannerResult[] = [];
    for (const ad of aerodromes) {
      const leg = estimateLeg(profile, input, ad);
      if (!leg) continue;

      results.push({
        aerodrome: {
          id: ad.id,
          name: ad.name,
          icaoCode: ad.icaoCode,
          latitude: ad.latitude,
          longitude: ad.longitude,
          city: ad.city,
          region: ad.region,
          elevation: ad.elevation,
          hasRestaurant: ad.hasRestaurant,
          hasTransport: ad.hasTransport,
          hasBikes: ad.hasBikes,
          hasAccommodation: ad.hasAccommodation,
          fuels: ad.fuels.map((f) => f.type),
          maxRunwayLength: ad.runways.length > 0 ? Math.max(...ad.runways.map((r) => r.length)) : null,
          ppr: ad.ppr,
          privateUse: ad.privateUse,
          skydiveActivity: ad.skydiveActivity,
        },
        ...leg,
      });
    }

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
