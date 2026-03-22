import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { VisitUpsertInput, AerodexStats, Badge } from "@aerodirectory/shared";
import { BADGES } from "@aerodirectory/shared";

@Injectable()
export class VisitService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, aerodromeId: string, input: VisitUpsertInput) {
    return this.prisma.visit.upsert({
      where: {
        userId_aerodromeId: { userId, aerodromeId },
      },
      create: {
        userId,
        aerodromeId,
        status: input.status,
        notes: input.notes,
      },
      update: {
        status: input.status,
        notes: input.notes,
      },
    });
  }

  async remove(userId: string, aerodromeId: string) {
    await this.prisma.visit.deleteMany({
      where: { userId, aerodromeId },
    });
  }

  async getUserVisits(userId: string) {
    return this.prisma.visit.findMany({
      where: { userId },
      include: {
        aerodrome: {
          select: {
            id: true,
            name: true,
            icaoCode: true,
            latitude: true,
            longitude: true,
            city: true,
          },
        },
      },
      orderBy: { visitedAt: "desc" },
    });
  }

  async getAerodexStats(userId: string): Promise<AerodexStats> {
    const visits = await this.prisma.visit.findMany({
      where: { userId },
      include: {
        aerodrome: {
          select: { latitude: true, longitude: true },
        },
      },
    });

    const totalAerodromes = await this.prisma.aerodrome.count();

    const visitedCount = visits.filter((v) => v.status === "VISITED" || v.status === "FAVORITE").length;
    const seenCount = visits.filter((v) => v.status === "SEEN").length;
    const favoriteCount = visits.filter((v) => v.status === "FAVORITE").length;

    // Estimate total distance as sum of consecutive visit distances
    let estimatedDistanceNm = 0;
    const visitedAerodromes = visits
      .filter((v) => v.status === "VISITED" || v.status === "FAVORITE")
      .sort((a, b) => a.visitedAt.getTime() - b.visitedAt.getTime());

    for (let i = 1; i < visitedAerodromes.length; i++) {
      const prev = visitedAerodromes[i - 1]!.aerodrome;
      const curr = visitedAerodromes[i]!.aerodrome;
      estimatedDistanceNm += haversineNm(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude,
      );
    }

    // Compute badges
    const badges: Badge[] = BADGES.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      earned: visitedCount >= b.threshold,
    }));

    return {
      visitedCount,
      seenCount,
      favoriteCount,
      totalAerodromes,
      badges,
      estimatedDistanceNm: Math.round(estimatedDistanceNm),
      estimatedTotalCost: 0, // Requires aircraft profile integration
    };
  }
}

function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065; // Earth radius in nautical miles
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
