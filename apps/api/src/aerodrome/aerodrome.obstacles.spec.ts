import { describe, it, expect, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AerodromeService, initialBearing } from "./aerodrome.service";

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
  const service = new AerodromeService(prisma as never, {} as never, {} as never);
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
    const service = new AerodromeService(prisma as never, {} as never, {} as never);

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
