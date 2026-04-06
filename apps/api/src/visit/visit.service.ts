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
      where: { userId, status: { in: ["VISITED", "FAVORITE"] } },
      include: {
        aerodrome: {
          select: {
            id: true,
            name: true,
            icaoCode: true,
            latitude: true,
            longitude: true,
            city: true,
            aerodromeType: true,
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
          select: { latitude: true, longitude: true, aerodromeType: true },
        },
      },
    });

    const [totalAerodromes, totalAltiport, totalUlm, totalHeli] = await Promise.all([
      this.prisma.aerodrome.count({ where: { aerodromeType: { notIn: ["ULTRALIGHT_FIELD", "HELIPORT", "ALTIPORT"] } } }),
      this.prisma.aerodrome.count({ where: { aerodromeType: "ALTIPORT" } }),
      this.prisma.aerodrome.count({ where: { aerodromeType: "ULTRALIGHT_FIELD" } }),
      this.prisma.aerodrome.count({ where: { aerodromeType: "HELIPORT" } }),
    ]);

    const visitedEntries = visits.filter((v) => v.status === "VISITED" || v.status === "FAVORITE");
    const visitedCount = visitedEntries.length;
    const seenCount = visits.filter((v) => v.status === "SEEN").length;
    const favoriteCount = visits.filter((v) => v.status === "FAVORITE").length;

    const byType = {
      aerodromes: {
        visited: visitedEntries.filter((v) => !["ULTRALIGHT_FIELD", "HELIPORT", "ALTIPORT"].includes(v.aerodrome.aerodromeType)).length,
        total: totalAerodromes,
      },
      altiport: {
        visited: visitedEntries.filter((v) => v.aerodrome.aerodromeType === "ALTIPORT").length,
        total: totalAltiport,
      },
      ulm: {
        visited: visitedEntries.filter((v) => v.aerodrome.aerodromeType === "ULTRALIGHT_FIELD").length,
        total: totalUlm,
      },
      heli: {
        visited: visitedEntries.filter((v) => v.aerodrome.aerodromeType === "HELIPORT").length,
        total: totalHeli,
      },
    };

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
      totalAerodromes: totalAerodromes + totalAltiport + totalUlm + totalHeli,
      byType,
      badges,
      estimatedDistanceNm: Math.round(estimatedDistanceNm),
      estimatedTotalCost: 0,
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
