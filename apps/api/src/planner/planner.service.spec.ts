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
  return { prisma, service: new PlannerService(prisma as never, {} as never) };
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

describe("PlannerService.briefing", () => {
  const field = (id: string, latitude: number, longitude: number, magneticDeclination: number | null, fuels: string[] = []) => ({
    id,
    name: id,
    icaoCode: null,
    latitude,
    longitude,
    elevation: 500,
    magneticDeclination,
    fuels: fuels.map((type) => ({ type })),
  });

  function buildBriefing(found: { profile?: unknown; fields?: unknown[]; airspaces?: unknown[]; obstacles?: unknown[] }) {
    const prisma = {
      aircraftProfile: { findFirst: vi.fn().mockResolvedValue("profile" in found ? found.profile : { ...profile, name: "F-GXXX", maxCrosswindKt: 15 }) },
      aerodrome: { findMany: vi.fn().mockResolvedValue(found.fields ?? []) },
      communityInfo: { findMany: vi.fn().mockResolvedValue([]) },
      obstacle: { findMany: vi.fn().mockResolvedValue(found.obstacles ?? []) },
    };
    const airspaces = { findAll: vi.fn().mockResolvedValue(found.airspaces ?? []) };
    return { prisma, service: new PlannerService(prisma as never, airspaces as never) };
  }
  const query = {
    profileId: "p1",
    departureId: "dep",
    destinationId: "dest",
    viaIds: [] as string[],
    tripScope: "round_trip" as const,
    reserveMinutes: 0,
    departureGroundMinutes: 0,
    arrivalGroundMinutes: 0,
    stayMinutes: 60,
  };

  it("gives each leg its true and magnetic course", async () => {
    const { service } = buildBriefing({ fields: [field("dep", 0, 0, 2), field("dest", 0, 1, null)] });
    const trip = await service.briefing("u1", query);

    expect(trip.legs.map((l) => [l.fromId, l.toId, l.trueCourse, l.magneticCourse])).toEqual([
      ["dep", "dest", 90, 88], // 2° east at the departure
      ["dest", "dep", 270, null], // unknown at the destination
    ]);
    expect(trip.withinRange).toBe(true);
    expect(trip.stops).toEqual([]);
    expect(trip.aircraft.maxCrosswindKt).toBe(15);
  });

  it("flies through the stops in order", async () => {
    const { service } = buildBriefing({ fields: [field("dest", 0, 2, null), field("via", 0, 1, null), field("dep", 0, 0, null)] });
    const trip = await service.briefing("u1", { ...query, viaIds: ["via"], tripScope: "outbound" });

    expect(trip.legs.map((l) => l.toId)).toEqual(["via", "dest"]);
    expect(trip.stops.map((s) => s.id)).toEqual(["via"]);
    expect(trip.distanceNm).toBeCloseTo(120, 0);
  });

  it("still answers for a field out of reach, and says so", async () => {
    const { service } = buildBriefing({ fields: [field("dep", 0, 0, null), field("dest", 0, 5, null)] });
    const trip = await service.briefing("u1", query);

    expect(trip.distanceNm).toBeGreaterThan(590);
    expect(trip.withinRange).toBe(false);
  });

  it("lists the low airspaces crossed and the obstacles near the route, in route order", async () => {
    const square = (lon: number) => ({ type: "Polygon", coordinates: [[[lon, -0.1], [lon + 0.1, -0.1], [lon + 0.1, 0.1], [lon, 0.1], [lon, -0.1]]] });
    const { service } = buildBriefing({
      fields: [field("dep", 0, 0, null), field("dest", 0, 1, null)],
      airspaces: [
        { id: "tma", name: "TMA", type: 5, icaoClass: "D", lowerLimit: "2500ft", upperLimit: "FL115", lowerLimitFt: 2500, geometry: square(0.6), onRequest: false, onDemand: false },
        { id: "r", name: "R 1", type: 1, icaoClass: "R", lowerLimit: "SFC", upperLimit: "3000ft", lowerLimitFt: null, geometry: square(0.3), onRequest: false, onDemand: true },
        { id: "high", name: "high", type: 5, icaoClass: "D", lowerLimit: "FL085", upperLimit: "FL195", lowerLimitFt: 8500, geometry: square(0.3), onRequest: false, onDemand: false },
        { id: "fir", name: "FIR", type: 8, icaoClass: "G", lowerLimit: "SFC", upperLimit: "UNL", lowerLimitFt: null, geometry: square(0.3), onRequest: false, onDemand: false },
        { id: "aside", name: "aside", type: 2, icaoClass: "D", lowerLimit: "SFC", upperLimit: "3000ft", lowerLimitFt: null, geometry: { type: "Polygon", coordinates: [[[0.3, 1], [0.4, 1], [0.4, 1.1], [0.3, 1]]] }, onRequest: false, onDemand: false },
      ],
      obstacles: [
        { id: "on", name: null, type: "WIND_TURBINE", latitude: 0.005, longitude: 0.5, heightM: 150, elevationM: 400 },
        { id: "off", name: null, type: "TOWER", latitude: 0.05, longitude: 0.5, heightM: 200, elevationM: 500 }, // 3 NM off
      ],
    });
    const trip = await service.briefing("u1", { ...query, tripScope: "outbound" });

    expect(trip.airspaces.map((a) => a.id)).toEqual(["r", "tma"]);
    expect(trip.airspaces[0]!.alongNm).toBeCloseTo(18, 0);
    expect(trip.obstacles.map((o) => o.id)).toEqual(["on"]);
    expect(trip.obstacles[0]!.offsetNm).toBeCloseTo(0.3, 1);
    expect(trip.obstacleCount).toBe(1);
  });

  it("refuses another member's aircraft and unknown fields", async () => {
    await expect(buildBriefing({ profile: null }).service.briefing("u1", query)).rejects.toThrow(/profile/i);
    await expect(buildBriefing({ fields: [field("dep", 0, 0, null)] }).service.briefing("u1", query)).rejects.toThrow(/introuvable/);
  });
});
