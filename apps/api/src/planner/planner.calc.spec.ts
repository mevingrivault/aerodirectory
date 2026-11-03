import { describe, expect, it } from "vitest";
import { PlannerQuerySchema, type PlannerQueryInput } from "@aerodirectory/shared";
import {
  buildDestinationWhere,
  checkNight,
  computeRoute,
  computeTrip,
  estimateLeg,
  isAeronauticalNight,
  nightsParked,
  stayNights,
  type PlannerAircraft,
} from "./planner.calc";

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

  it("adds the landing fee to the cost and to the cost limit", () => {
    const leg = estimateLeg(aircraft, query({ tripScope: "outbound" }), { ...at(100), landingFee: 12 })!;
    expect(leg.estimatedCost).toBeCloseTo(162, 0);
    expect(estimateLeg(aircraft, query({ tripScope: "outbound", searchMode: "cost", maxCost: 155 }), { ...at(100), landingFee: 12 })).toBeNull();
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

describe("buildDestinationWhere, hangar, webcam and paved filters", () => {
  it("keeps only paved surfaces the aircraft accepts", () => {
    const where = buildDestinationWhere(aircraft, query({ filters: { pavedRunway: true } }), "u1");
    expect(where.runways).toEqual({ some: { length: { gte: 600 }, surface: { in: ["ASPHALT"] } } });
  });

  it("accepts an imported hangar or a member report, and either webcam source", () => {
    const where = buildDestinationWhere(aircraft, query({ filters: { hasHangar: true, hasWebcam: true } }), "u1");
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND)).toContain('"hasHangars":true');
    expect(JSON.stringify(where.AND)).toContain('"equals":"ON_REQUEST"');
    expect(JSON.stringify(where.AND)).toContain('"webcams":{"some":{}}');
    expect(buildDestinationWhere(aircraft, query(), "u1")).not.toHaveProperty("AND");
  });
});

describe("parking", () => {
  it("counts the midnights, French time, between landing and take-off", () => {
    // 22:30 UTC on 21 June is already 00:30 on the 22nd in Paris.
    expect(nightsParked(Date.parse("2026-06-21T15:00:00Z"), Date.parse("2026-06-21T21:00:00Z"))).toBe(0);
    expect(nightsParked(Date.parse("2026-06-21T15:00:00Z"), Date.parse("2026-06-21T22:30:00Z"))).toBe(1);
    expect(nightsParked(Date.parse("2026-06-21T15:00:00Z"), Date.parse("2026-06-23T08:00:00Z"))).toBe(2);
  });

  it("only counts a round trip with a departure time", () => {
    const leg = { timeHours: 1 };
    expect(stayNights(query({ departureTime: "2026-06-21T08:00:00Z", stayMinutes: 1440 }), leg)).toBe(1);
    expect(stayNights(query({ stayMinutes: 1440 }), leg)).toBe(0);
    expect(stayNights(query({ tripScope: "outbound", departureTime: "2026-06-21T08:00:00Z", stayMinutes: 1440 }), leg)).toBe(0);
  });
});

describe("computeRoute", () => {
  const point = (id: string, nm: number, fuels: string[] = [], extra: object = {}) => ({ id, ...at(nm, fuels), ...extra });
  const input = { reserveMinutes: 0, departureGroundMinutes: 0, arrivalGroundMinutes: 0, stayMinutes: 60 };

  it("matches computeTrip for a plain round trip", () => {
    for (const [nm, fuels] of [[100, []], [250, ["AVGAS_100LL"]], [250, []]] as const) {
      const trip = computeTrip(aircraft, query(), { ...at(nm, [...fuels]), landingFee: 12 });
      const route = computeRoute(aircraft, input, [point("A", 0), point("B", nm, [...fuels], { landingFee: 12 }), point("A", 0)]);
      expect(route.distanceNm).toBeCloseTo(trip.distanceNm * 2, 0);
      expect(route.tripTimeHours).toBeCloseTo(trip.tripTimeHours, 1);
      expect(route.estimatedCost).toBeCloseTo(trip.estimatedCost, 0);
      expect(route.withinRange).toBe(trip.withinRange);
    }
  });

  it("refuels at a stop early enough when the next one sells nothing", () => {
    // 150 + 150 + 150 NM, 400 NM in the tank: fill up at B, since C has no fuel.
    const route = computeRoute(aircraft, input, [point("A", 0), point("B", 150, ["AVGAS_100LL"]), point("C", 300), point("D", 450)]);
    expect(route.legs.map((l) => l.refuelBefore)).toEqual([false, true, false]);
    expect(route.withinRange).toBe(true);
    // Without fuel at B the last leg runs dry.
    const dry = computeRoute(aircraft, input, [point("A", 0), point("B", 150), point("C", 300), point("D", 450)]);
    expect(dry.legs.map((l) => l.withinRange)).toEqual([true, true, false]);
  });

  it("times every leg, pays every landing but the one back home, and the nights parked", () => {
    const route = computeRoute(
      aircraft,
      { ...input, departureTime: "2026-06-21T08:00:00Z", stayMinutes: 1440 },
      [point("A", 0), point("B", 100, [], { landingFee: 10, parkingPerNight: 5 }), point("A", 0, [], { landingFee: 99 })],
    );
    expect(route.legs[0]!.landingAt).toBe("2026-06-21T09:00:00.000Z");
    expect(route.legs[1]!.takeOffAt).toBe("2026-06-22T09:00:00.000Z");
    expect(route.landingFees).toBe(10);
    expect(route.parkingFees).toBe(5);
    expect(route.nightOperation).toBe(false);
  });
});

describe("aeronautical night", () => {
  // Paris, 21 June 2026: sunset ≈ 19:58 UTC, so aeronautical night from ≈ 20:28 UTC.
  const paris = { latitude: 48.85, longitude: 2.35 };

  it("starts 30 minutes after sunset", () => {
    expect(isAeronauticalNight(new Date("2026-06-21T20:15:00Z"), paris)).toBe(false);
    expect(isAeronauticalNight(new Date("2026-06-21T20:45:00Z"), paris)).toBe(true);
    expect(isAeronauticalNight(new Date("2026-06-21T03:00:00Z"), paris)).toBe(true);
  });

  it("follows the trip from off-block to the landing back home", () => {
    const input = query({
      departureTime: "2026-06-21T16:00:00Z",
      departureGroundMinutes: 10,
      arrivalGroundMinutes: 5,
      stayMinutes: 90,
    });
    const check = checkNight(input, { timeHours: 1 }, paris, paris)!;
    // 16:10 take-off, 17:10 landing, +5 taxi +90 stay +10 taxi, 18:55 take-off, 19:55 landing
    expect(check.arrivalAt).toBe("2026-06-21T17:10:00.000Z");
    expect(check.returnAt).toBe("2026-06-21T19:55:00.000Z");
    expect(check.nightOperation).toBe(false);
  });

  it("flags a return that lands after nightfall", () => {
    const input = query({ departureTime: "2026-06-21T17:30:00Z", stayMinutes: 60 });
    expect(checkNight(input, { timeHours: 1 }, paris, paris)!.nightOperation).toBe(true);
    expect(checkNight(query({ tripScope: "outbound", departureTime: "2026-06-21T17:30:00Z" }), { timeHours: 1 }, paris, paris)!.nightOperation).toBe(false);
  });

  it("checks nothing without a departure time", () => {
    expect(checkNight(query(), { timeHours: 1 }, paris, paris)).toBeNull();
  });
});
