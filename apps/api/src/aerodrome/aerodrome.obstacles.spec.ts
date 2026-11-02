import { describe, it, expect, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AerodromeService, initialBearing, windRose } from "./aerodrome.service";

/**
 * Obstacles shown around an aerodrome: only those inside the radius,
 * nearest first, with the distance and bearing a pilot reads them by.
 */

const TOUSSUS = { latitude: 48.7519, longitude: 2.1061 };

function build(aerodrome: typeof TOUSSUS | null, obstacles: Record<string, unknown>[]) {
  const prisma = {
    aerodrome: { findUnique: vi.fn().mockResolvedValue(aerodrome) },
    obstacle: { findMany: vi.fn().mockResolvedValue(obstacles) },
  };
  const service = new AerodromeService(prisma as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

function obstacle(id: string, latitude: number, longitude: number) {
  return { id, name: null, type: "TOWER", latitude, longitude, heightM: 60, elevationM: 230 };
}

describe("AerodromeService.findObstaclesNear", () => {
  it("keeps obstacles inside the radius, nearest first, with distance and bearing", async () => {
    const { service, prisma } = build(TOUSSUS, [
      obstacle("far-corner", 48.7519 + 0.06, 2.1061 + 0.09), // inside the box, ~9.5 km away
      obstacle("east-2km", 48.7519, 2.1061 + 0.0272),
      obstacle("north-1km", 48.7519 + 0.009, 2.1061),
    ]);

    const result = await service.findObstaclesNear("a1", 5000);

    expect(result.map((o) => o.id)).toEqual(["north-1km", "east-2km"]);
    expect(result[0]).toMatchObject({ distanceM: 1001, bearingDeg: 0 });
    expect(result[1]!.bearingDeg).toBe(90);
    expect(result[1]!.distanceM).toBeGreaterThan(1950);
    expect(result[1]!.distanceM).toBeLessThan(2050);

    const where = prisma.obstacle.findMany.mock.calls[0]![0].where;
    expect(where.latitude.gte).toBeCloseTo(48.7519 - 0.0449, 3);
    expect(where.longitude.lte).toBeGreaterThan(2.1061 + 0.068);
  });

  it("answers 404 for an unknown aerodrome", async () => {
    const { service } = build(null, []);
    await expect(service.findObstaclesNear("nope", 5000)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AerodromeService.findProtectedAreasNear", () => {
  const square = (lon: number, lat: number, size: number) => ({
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
  });

  it("keeps the areas within the radius by real distance, nearest first, 0 when inside", async () => {
    const prisma = {
      aerodrome: { findUnique: vi.fn().mockResolvedValue(TOUSSUS) },
      protectedArea: {
        findMany: vi.fn().mockResolvedValue([
          // Bounding box meets the search box, polygon is ~8 km away.
          { id: "far", name: "Loin", kind: "BIRD_SPA", detail: null, geometry: square(2.1061 + 0.11, 48.7519 - 0.05, 0.1) },
          { id: "around", name: "Autour", kind: "NATURE_RESERVE", detail: null, geometry: square(2.1, 48.75, 0.01) },
          { id: "near", name: "Proche", kind: "BIOTOPE_PROTECTION", detail: null, geometry: square(2.1061, 48.7519 + 0.018, 0.01) },
        ]),
      },
    };
    const service = new AerodromeService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.findProtectedAreasNear("a1", 5000);

    expect(result.map((a) => [a.id, a.distanceM])).toEqual([["around", 0], ["near", expect.any(Number)]]);
    expect(result[1]!.distanceM).toBeGreaterThan(1950);
    expect(result[1]!.distanceM).toBeLessThan(2050);

    // Candidates are found by overlapping bounding boxes.
    const where = prisma.protectedArea.findMany.mock.calls[0]![0].where;
    expect(where.minLat.lte).toBeGreaterThan(48.7519);
    expect(where.maxLat.gte).toBeLessThan(48.7519);
  });
});

describe("AerodromeService.findAerialLinesNear", () => {
  it("keeps lines within the radius by their closest point, with its bearing", async () => {
    const line = (id: string, coordinates: [number, number][]) => ({
      id, kind: "POWER_LINE", detail: "63 kV", name: null, geometry: { type: "LineString", coordinates },
    });
    const prisma = {
      aerodrome: { findUnique: vi.fn().mockResolvedValue(TOUSSUS) },
      aerialLine: {
        findMany: vi.fn().mockResolvedValue([
          // Crosses the search box but passes ~6 km away.
          line("far", [[2.1061 - 0.2, 48.7519 + 0.054], [2.1061 + 0.2, 48.7519 + 0.054]]),
          // East-west line 1 km south of the aerodrome.
          line("south", [[2.09, 48.7519 - 0.009], [2.12, 48.7519 - 0.009]]),
        ]),
      },
    };
    const service = new AerodromeService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.findAerialLinesNear("a1", 5000);

    expect(result.map((l) => l.id)).toEqual(["south"]);
    expect(result[0]).toMatchObject({ distanceM: 1002, bearingDeg: 180 });
  });
});

describe("windRose", () => {
  it("folds 10° bins into 30° sectors centred on their heading, in percent", () => {
    const counts = Array.from({ length: 36 }, () => [0, 0, 0]);
    counts[35] = [10, 0, 0]; // 350° → north sector
    counts[0] = [10, 5, 0];
    counts[1] = [5, 0, 0]; // 010° → north sector
    counts[2] = [0, 0, 20]; // 020° → 030° sector
    counts[27] = [30, 10, 0]; // 270°

    const rose = windRose(counts, 10, 100);

    expect(rose.sectors).toHaveLength(12);
    expect(rose.sectors[0]).toEqual({ heading: 0, classes: [25, 5, 0], total: 30 });
    expect(rose.sectors[1]).toEqual({ heading: 30, classes: [0, 0, 20], total: 20 });
    expect(rose.sectors[9]!.total).toBe(40);
    expect(rose).toMatchObject({ calm: 10, prevailingHeading: 270, observations: 100 });
  });
});

describe("AerodromeService.findWindClimate", () => {
  const station = (stationId: string, latitude: number, longitude: number) => ({
    stationId, name: stationId, latitude, longitude, altitudeM: 150, periodStart: 2020, periodEnd: 2024,
    observations: 100, calm: 0, counts: Array.from({ length: 36 }, (_, i) => (i === 27 ? [100, 0, 0] : [0, 0, 0])),
  });

  it("uses the nearest station within 30 km", async () => {
    const prisma = {
      aerodrome: { findUnique: vi.fn().mockResolvedValue(TOUSSUS) },
      windClimate: { findMany: vi.fn().mockResolvedValue([station("FAR", 48.95, 2.1061), station("NEAR", 48.78, 2.1061)]) },
    };
    const service = new AerodromeService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.findWindClimate("a1");

    expect(result?.station).toMatchObject({ name: "NEAR", distanceKm: 3.1 });
    expect(result).toMatchObject({ prevailingHeading: 270, period: { from: 2020, to: 2024 } });
  });

  it("returns null without a station close enough", async () => {
    const prisma = {
      aerodrome: { findUnique: vi.fn().mockResolvedValue(TOUSSUS) },
      windClimate: { findMany: vi.fn().mockResolvedValue([station("EDGE", 48.7519 + 0.27, 2.1061 + 0.1)]) },
    };
    const service = new AerodromeService(prisma as never, {} as never, {} as never, {} as never);
    expect(await service.findWindClimate("a1")).toBeNull();
  });
});

describe("initialBearing", () => {
  it.each([
    [0.01, 0, 0],
    [0, 0.01, 90],
    [-0.01, 0, 180],
    [0, -0.01, 270],
  ])("Δlat %s, Δlon %s → %s°", (dLat, dLon, expected) => {
    expect(initialBearing(45, 3, 45 + dLat, 3 + dLon)).toBe(expected);
  });
});
