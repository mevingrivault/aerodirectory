import { describe, expect, it, vi } from "vitest";
import { PlannerService } from "./planner.service";

const profile = {
  id: "p1",
  tas: 100,
  fuelConsumption: 30,
  hourlyCost: 150,
  fuelRange: 400,
  minRunwayLength: 0,
  allowedSurfaces: ["GRASS"],
  fuelType: "AVGAS_100LL",
  category: "LIGHT",
};

const aerodrome = (id: string, longitude: number) => ({
  id,
  name: id,
  icaoCode: null,
  latitude: 0,
  longitude,
  city: null,
  region: null,
  elevation: null,
  hasRestaurant: false,
  hasTransport: false,
  hasBikes: false,
  hasAccommodation: false,
  ppr: false,
  privateUse: false,
  skydiveActivity: false,
  runways: [{ length: 800 }],
  fuels: [],
});

function build(rows: unknown[]) {
  const prisma = {
    aircraftProfile: { findFirst: vi.fn().mockResolvedValue(profile) },
    aerodrome: { findMany: vi.fn().mockResolvedValue([aerodrome("near", 1), aerodrome("far", 10)]) },
    communityInfo: { findMany: vi.fn().mockResolvedValue(rows) },
  };
  return { prisma, service: new PlannerService(prisma as never) };
}

const input = {
  profileId: "p1",
  departureLat: 0,
  departureLng: 0,
  searchMode: "unlimited" as const,
  tripScope: "outbound" as const,
  reserveMinutes: 0,
  departureGroundMinutes: 0,
  arrivalGroundMinutes: 0,
  stayMinutes: 60,
  sortBy: "time" as const,
};

describe("PlannerService.plan with member reports", () => {
  it("looks up reports only for reachable fields and uses the newest one", async () => {
    const { service, prisma } = build([
      { aerodromeId: "near", kind: "LANDING_FEE", data: { category: "LIGHT", landingFee: 10 }, observedAt: new Date("2026-10-01") },
      { aerodromeId: "near", kind: "LANDING_FEE", data: { category: "LIGHT", landingFee: 7 }, observedAt: new Date("2025-01-01") },
      { aerodromeId: "near", kind: "FUEL_PRICE", data: { fuelType: "AVGAS_100LL", pricePerLiter: 2.95 }, observedAt: new Date("2026-09-01") },
    ]);

    const [result, ...rest] = await service.plan("u1", input);

    expect(rest).toHaveLength(0); // "far" is 600 NM away
    expect(prisma.communityInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          aerodromeId: { in: ["near"] },
          contentStatus: "APPROVED",
          OR: [{ kind: "LANDING_FEE", key: "LIGHT" }, { kind: "FUEL_PRICE", key: "AVGAS_100LL" }],
        }),
      }),
    );
    expect(result!.landingFee).toMatchObject({ amount: 10 });
    expect(result!.fuelPrice).toMatchObject({ pricePerLiter: 2.95 });
    // 60 NM at 100 kt = 0.6 h × 150 € + 10 € landing fee
    expect(result!.estimatedCost).toBeCloseTo(100, 0);
    expect(result!.nightOperation).toBeNull();
  });
});
