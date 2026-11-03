import { describe, expect, it } from "vitest";
import { PlannerQuerySchema, type PlannerQueryInput } from "@aerodirectory/shared";
import { buildDestinationWhere, estimateLeg, type PlannerAircraft } from "./planner.calc";

/** A DR400-ish: 100 kt, 30 L/h, 150 €/h, 400 NM with full tanks. */
const aircraft: PlannerAircraft = {
  tas: 100,
  fuelConsumption: 30,
  hourlyCost: 150,
  fuelRange: 400,
  minRunwayLength: 600,
  allowedSurfaces: ["ASPHALT", "GRASS"],
  fuelType: "AVGAS_100LL",
};

// Departure on the equator, so 1° of longitude ≈ 60.04 NM.
const query = (overrides: Record<string, unknown> = {}): PlannerQueryInput =>
  PlannerQuerySchema.parse({
    profileId: "cjld2cjxh0000qzrmn831i7rn",
    departureLat: 0,
    departureLng: 0,
    searchMode: "unlimited",
    reserveMinutes: 0,
    ...overrides,
  });
const at = (nm: number, fuels: string[] = []) => ({ latitude: 0, longitude: nm / 60.04, fuels: fuels.map((type) => ({ type })) });

describe("estimateLeg", () => {
  it("computes time, fuel and cost of a round trip", () => {
    const leg = estimateLeg(aircraft, query({ departureGroundMinutes: 10, arrivalGroundMinutes: 5 }), at(100))!;

    expect(leg.distanceNm).toBeCloseTo(100, 0);
    expect(leg.timeHours).toBeCloseTo(1, 2);
    expect(leg.fuelUsedLiters).toBeCloseTo(30, 0);
    // 2 h in the air + 2 × 15 min on the ground
    expect(leg.tripTimeHours).toBeCloseTo(2.5, 2);
    expect(leg.tripFuelLiters).toBeCloseTo(60, 0);
    expect(leg.estimatedCost).toBeCloseTo(375, 0);
    expect(leg.refuelRequired).toBe(false);
  });

  it("adds the fuel bill when a price per litre is given", () => {
    const leg = estimateLeg(aircraft, query({ tripScope: "outbound", fuelPricePerLiter: 2.5 }), at(100))!;
    expect(leg.fuelCost).toBeCloseTo(75, 0);
    expect(leg.estimatedCost).toBeCloseTo(225, 0);
  });

  it("takes the reserve off the range", () => {
    // 400 NM − 30 min at 100 kt = 350 NM usable
    expect(estimateLeg(aircraft, query({ tripScope: "outbound", reserveMinutes: 30 }), at(340))).not.toBeNull();
    expect(estimateLeg(aircraft, query({ tripScope: "outbound", reserveMinutes: 30 }), at(360))).toBeNull();
  });

  it("keeps a round trip within one tank when the destination has no fuel", () => {
    expect(estimateLeg(aircraft, query(), at(190))).not.toBeNull();
    expect(estimateLeg(aircraft, query(), at(250))).toBeNull();
  });

  it("goes further when the destination sells the aircraft's fuel", () => {
    const leg = estimateLeg(aircraft, query(), at(250, ["AVGAS_100LL"]))!;
    expect(leg).not.toBeNull();
    expect(leg.refuelRequired).toBe(true);
    expect(leg.canRefuel).toBe(true);
    // Each leg must still fit in the tank.
    expect(estimateLeg(aircraft, query(), at(450, ["AVGAS_100LL"]))).toBeNull();
  });

  it("does not count on a fuel the aircraft cannot burn, or on an unknown one", () => {
    expect(estimateLeg(aircraft, query(), at(250, ["JET_A1"]))).toBeNull();
    expect(estimateLeg({ ...aircraft, fuelType: null }, query(), at(250, ["AVGAS_100LL"]))).toBeNull();
  });

  it("applies the time and cost limits on the whole trip", () => {
    expect(estimateLeg(aircraft, query({ searchMode: "time", maxTimeMinutes: 90 }), at(50))).not.toBeNull();
    expect(estimateLeg(aircraft, query({ searchMode: "time", maxTimeMinutes: 90 }), at(100))).toBeNull();
    expect(estimateLeg(aircraft, query({ searchMode: "cost", maxCost: 200 }), at(100))).toBeNull();
  });

  it("skips the departure field and honours the distance bounds", () => {
    expect(estimateLeg(aircraft, query(), at(0.1))).toBeNull();
    expect(estimateLeg(aircraft, query({ minDistanceNm: 60 }), at(50))).toBeNull();
    expect(estimateLeg(aircraft, query({ maxDistanceNm: 40 }), at(50))).toBeNull();
  });
});

describe("buildDestinationWhere", () => {
  it("leaves out winch-only fields, heliports and, by default, private fields", () => {
    const where = buildDestinationWhere(aircraft, query(), "u1");
    expect(where).toMatchObject({ status: "OPEN", winchOnly: false, aerodromeType: { not: "HELIPORT" }, privateUse: false });
    expect(buildDestinationWhere(aircraft, query({ includePrivate: true }), "u1")).not.toHaveProperty("privateUse");
  });

  it("asks for a runway long enough with an accepted surface", () => {
    expect(buildDestinationWhere(aircraft, query(), "u1").runways).toEqual({
      some: { length: { gte: 600 }, surface: { in: ["ASPHALT", "GRASS"] } },
    });
  });

  it("turns every fuel filter, UL91 and Jet A1 included, into one OR clause", () => {
    const where = buildDestinationWhere(aircraft, query({ filters: { fuelUL91: true, fuelJetA1: true } }), "u1");
    expect(where.fuels).toEqual({ some: { type: { in: ["UL91", "JET_A1"] }, available: true } });
  });
});
