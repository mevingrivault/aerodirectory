import { describe, expect, it } from "vitest";
import { inPolygon, legBoxes, routeEntryNm, routeOffset } from "./route-hazards";

// Along the equator, 1° of longitude ≈ 60 NM.
const route = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }];
const box = (minLon: number, maxLon: number, minLat = -0.1, maxLat = 0.1) => ({
  type: "Polygon",
  coordinates: [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]],
});

describe("routeEntryNm", () => {
  it("gives the distance where the route enters", () => {
    expect(routeEntryNm(route, box(0.5, 0.6))).toBeCloseTo(30, 0);
  });

  it("is 0 when the route starts inside, and null when it never enters", () => {
    expect(routeEntryNm(route, box(-0.1, 0.1))).toBe(0);
    expect(routeEntryNm(route, box(0.5, 0.6, 0.2, 0.3))).toBeNull();
    expect(routeEntryNm(route, { type: "Point", coordinates: [0, 0] })).toBeNull();
  });

  it("follows the second leg and multipolygons", () => {
    const dogleg = [...route, { latitude: 1, longitude: 1 }];
    const geometry = { type: "MultiPolygon", coordinates: [box(0.9, 1.1, 0.5, 0.6).coordinates] };
    expect(routeEntryNm(dogleg, geometry)).toBeCloseTo(90, 0);
  });

  it("does not count a hole as inside", () => {
    const withHole = { type: "Polygon", coordinates: [...box(-1, 2, -1, 1).coordinates, ...box(-0.5, 0.5, -0.5, 0.5).coordinates] };
    expect(inPolygon({ latitude: 0, longitude: 0 }, withHole.coordinates as number[][][])).toBe(false);
    expect(routeEntryNm(route, withHole)).toBeCloseTo(30, 0); // leaves the hole at 0.5°
  });
});

describe("routeOffset", () => {
  it("measures along and across the route", () => {
    const { alongNm, offsetNm } = routeOffset(route, { latitude: 0.01, longitude: 0.25 });
    expect(alongNm).toBeCloseTo(15, 0);
    expect(offsetNm).toBeCloseTo(0.6, 1);
  });

  it("clamps to the ends", () => {
    expect(routeOffset(route, { latitude: 0, longitude: -0.1 }).offsetNm).toBeCloseTo(6, 0);
  });
});

describe("legBoxes", () => {
  it("widens each leg by the margin", () => {
    const [b] = legBoxes(route, 6);
    expect(b!.latitude.gte).toBeCloseTo(-0.1, 3);
    expect(b!.longitude.lte).toBeCloseTo(1.1, 3);
  });
});
