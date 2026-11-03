import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AircraftProfileInput,
  PlannerQueryInput,
  PlannerResult,
} from "@aerodirectory/shared";
import { buildDestinationWhere, checkNight, estimateLeg } from "./planner.calc";

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

    // A fee only adds to the cost, so what is out of reach without it stays out.
    const reachable = aerodromes.filter((ad) => estimateLeg(profile, input, ad));
    const reports = await this.memberReports(reachable.map((ad) => ad.id), profile);
    const departure = { latitude: input.departureLat, longitude: input.departureLng };

    const results: PlannerResult[] = [];
    for (const ad of reachable) {
      const report = reports.get(ad.id);
      const leg = estimateLeg(profile, input, { ...ad, landingFee: report?.landingFee?.amount });
      if (!leg) continue;
      const night = checkNight(input, leg, departure, ad);
      if (input.excludeNight && night?.nightOperation) continue;

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
        landingFee: report?.landingFee ?? null,
        fuelPrice: report?.fuelPrice ?? null,
        arrivalAt: night?.arrivalAt ?? null,
        returnAt: night?.returnAt ?? null,
        nightOperation: night?.nightOperation ?? null,
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

  /**
   * Newest approved landing fee for the aircraft's category and fuel price for
   * its fuel, per aerodrome. Nothing is looked up for what the profile leaves blank.
   */
  private async memberReports(
    aerodromeIds: string[],
    profile: { category: string | null; fuelType: string | null },
  ) {
    const wanted = [
      ...(profile.category ? [{ kind: "LANDING_FEE" as const, key: profile.category }] : []),
      ...(profile.fuelType ? [{ kind: "FUEL_PRICE" as const, key: profile.fuelType }] : []),
    ];
    const byAerodrome = new Map<string, Pick<PlannerResult, "landingFee" | "fuelPrice">>();
    if (wanted.length === 0 || aerodromeIds.length === 0) return byAerodrome;

    const rows = await this.prisma.communityInfo.findMany({
      where: { aerodromeId: { in: aerodromeIds }, contentStatus: "APPROVED", OR: wanted },
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
      select: { aerodromeId: true, kind: true, data: true, observedAt: true },
    });

    for (const row of rows) {
      const entry = byAerodrome.get(row.aerodromeId) ?? { landingFee: null, fuelPrice: null };
      const data = row.data as Record<string, unknown>;
      const observedAt = row.observedAt.toISOString();
      if (row.kind === "LANDING_FEE" && !entry.landingFee && typeof data["landingFee"] === "number") {
        entry.landingFee = {
          amount: data["landingFee"],
          parkingPerNight: typeof data["parkingPerNight"] === "number" ? data["parkingPerNight"] : null,
          observedAt,
        };
      }
      if (row.kind === "FUEL_PRICE" && !entry.fuelPrice && typeof data["pricePerLiter"] === "number") {
        entry.fuelPrice = { pricePerLiter: data["pricePerLiter"], observedAt };
      }
      byAerodrome.set(row.aerodromeId, entry);
    }
    return byAerodrome;
  }
}
