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
    if (!profile) throw new NotFoundException("Aircraft profile not found");

    const reserveHours = (input.reserveMinutes ?? 30) / 60;
    const isRoundTrip = (input.tripScope ?? "round_trip") === "round_trip";
    const scopeMultiplier = isRoundTrip ? 2 : 1;

    // Ground procedures: departure + arrival overhead, doubled for round trip
    const groundTimeHours =
      ((input.departureGroundMinutes ?? 0) + (input.arrivalGroundMinutes ?? 0)) /
      60 *
      scopeMultiplier;

    // Subtract reserve from total range to get usable range
    const reserveNm = reserveHours * profile.tas;
    const usableRangeNm = Math.max(0, profile.fuelRange - reserveNm);
    const maxOneWayNm = isRoundTrip ? usableRangeNm / 2 : usableRangeNm;

    const filters = input.filters ?? {};

    // Build fuel type filter (OR logic: has any of the required types)
    const requiredFuelTypes: string[] = [];
    if (filters.fuel100LL) requiredFuelTypes.push("AVGAS_100LL");
    if (filters.fuelSP98) requiredFuelTypes.push("SP98");
    const fuelsClause =
      requiredFuelTypes.length > 0
        ? {
            fuels: {
              some: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: { in: requiredFuelTypes as any },
                available: true,
              },
            },
          }
        : {};

    const aerodromes = await this.prisma.aerodrome.findMany({
      where: {
        status: "OPEN",
        runways: {
          some: {
            length: { gte: profile.minRunwayLength },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            surface: { in: profile.allowedSurfaces as any },
          },
        },
        ...(filters.hasRestaurant ? { hasRestaurant: true } : {}),
        ...(filters.hasTransport ? { hasTransport: true } : {}),
        ...(filters.hasBikes ? { hasBikes: true } : {}),
        ...(filters.hasAccommodation ? { hasAccommodation: true } : {}),
        ...fuelsClause,
      },
      include: {
        runways: true,
        fuels: { where: { available: true } },
      },
    });

    const fuelPricePerLiter = input.fuelPricePerLiter ?? 0;
    const results: PlannerResult[] = [];

    for (const ad of aerodromes) {
      const distanceNm = haversineNm(
        input.departureLat,
        input.departureLng,
        ad.latitude,
        ad.longitude,
      );

      // Skip departure aerodrome itself and anything beyond range
      if (distanceNm < 0.5) continue;
      if (distanceNm > maxOneWayNm) continue;
      if (input.maxDistanceNm && distanceNm > input.maxDistanceNm) continue;

      const timeHours = distanceNm / profile.tas;
      const tripTimeHours = round2(timeHours * scopeMultiplier + groundTimeHours);
      const fuelUsedLiters = timeHours * profile.fuelConsumption;
      const tripFuelLiters = fuelUsedLiters * scopeMultiplier;

      // Cost: hourly operating cost (includes ground time) + optional separate fuel cost
      const fuelCost = round2(tripFuelLiters * fuelPricePerLiter);
      const operatingCost = round2(tripTimeHours * profile.hourlyCost);
      const estimatedCost = round2(fuelCost + operatingCost);

      // Apply time constraint
      if (
        input.searchMode === "time" &&
        input.maxTimeMinutes !== undefined &&
        tripTimeHours * 60 > input.maxTimeMinutes
      ) {
        continue;
      }

      // Apply cost constraint
      if (
        input.searchMode === "cost" &&
        input.maxCost !== undefined &&
        estimatedCost > input.maxCost
      ) {
        continue;
      }

      const maxRunwayLength =
        ad.runways.length > 0
          ? Math.max(...ad.runways.map((r) => r.length))
          : null;

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
          maxRunwayLength,
        },
        distanceNm: round1(distanceNm),
        timeHours: round2(timeHours),
        fuelUsedLiters: round1(fuelUsedLiters),
        fuelCost,
        estimatedCost,
        tripTimeHours: round2(tripTimeHours),
        tripFuelLiters: round1(tripFuelLiters),
      });
    }

    // Sort
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

// ─── Helpers ────────────────────────────────────────

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in NM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
