import type { Prisma } from "@aerodirectory/database";
import { haversineNm, type PlannerQueryInput } from "@aerodirectory/shared";
import { computeSunTimes } from "../metar/sun";

/** The aircraft fields the calculation needs. */
export interface PlannerAircraft {
  tas: number; // knots
  fuelConsumption: number; // L/h
  hourlyCost: number; // €/h
  fuelRange: number; // NM, full tanks, no wind
  minRunwayLength: number; // m
  allowedSurfaces: string[];
  fuelType: string | null; // what the aircraft burns; null = unknown, never refuel
}

export interface PlannerDestination {
  latitude: number;
  longitude: number;
  fuels: { type: string }[]; // available fuels only
  landingFee?: number | null; // € per landing, from members; added to the cost
}

export interface LegEstimate {
  distanceNm: number;
  timeHours: number;
  fuelUsedLiters: number;
  tripTimeHours: number;
  tripFuelLiters: number;
  fuelCost: number;
  estimatedCost: number;
  /** Round trip only: the return leg needs fuel bought at the destination. */
  refuelRequired: boolean;
  /** The destination sells the fuel the aircraft burns. */
  canRefuel: boolean;
}

/** Fuel filters of the query → fuel types, any of which a destination must sell. */
export const FUEL_FILTERS = {
  fuel100LL: "AVGAS_100LL",
  fuelUL91: "UL91",
  fuelSP98: "SP98",
  fuelJetA1: "JET_A1",
} as const;

/**
 * Destinations the aircraft can use. Winch-only fields (gliders) and
 * heliports never are; private fields only on request, since landing there
 * needs the owner's permission. PPR fields stay in and are flagged.
 */
export function buildDestinationWhere(
  aircraft: Pick<PlannerAircraft, "minRunwayLength" | "allowedSurfaces">,
  input: PlannerQueryInput,
  userId: string,
): Prisma.AerodromeWhereInput {
  const filters = input.filters ?? {};
  const fuelTypes = Object.entries(FUEL_FILTERS)
    .filter(([key]) => filters[key as keyof typeof FUEL_FILTERS])
    .map(([, type]) => type);

  return {
    status: "OPEN",
    winchOnly: false,
    aerodromeType: { not: "HELIPORT" },
    ...(input.includePrivate ? {} : { privateUse: false }),
    runways: {
      some: {
        length: { gte: aircraft.minRunwayLength },
        surface: { in: aircraft.allowedSurfaces as Prisma.EnumSurfaceTypeFilter["in"] },
      },
    },
    ...(filters.hasRestaurant ? { hasRestaurant: true } : {}),
    ...(filters.hasTransport ? { hasTransport: true } : {}),
    ...(filters.hasBikes ? { hasBikes: true } : {}),
    ...(filters.hasAccommodation ? { hasAccommodation: true } : {}),
    ...(fuelTypes.length > 0
      ? { fuels: { some: { type: { in: fuelTypes as Prisma.EnumFuelTypeFilter["in"] }, available: true } } }
      : {}),
    ...(input.excludeVisited
      ? { visits: { none: { userId, status: { in: ["VISITED", "FAVORITE"] } } } }
      : {}),
  };
}

/** What a trip needs from the query, whether it comes from the planner or a briefing. */
export type TripInput = Pick<
  PlannerQueryInput,
  | "departureLat"
  | "departureLng"
  | "tripScope"
  | "reserveMinutes"
  | "departureGroundMinutes"
  | "arrivalGroundMinutes"
  | "fuelPricePerLiter"
  | "departureTime"
  | "stayMinutes"
>;

export interface TripEstimate extends LegEstimate {
  usableRangeNm: number;
  /** One tank covers the trip, or each leg of it when the destination sells the aircraft's fuel. */
  withinRange: boolean;
}

/**
 * Time, fuel and cost to a destination, reachable or not. Straight line,
 * no wind. The reserve is taken off the range. Without refuelling, a round
 * trip must fit in the usable range; when the destination sells the
 * aircraft's fuel, each leg only has to.
 */
export function computeTrip(aircraft: PlannerAircraft, input: TripInput, destination: PlannerDestination): TripEstimate {
  const distanceNm = haversineNm(input.departureLat, input.departureLng, destination.latitude, destination.longitude);
  const isRoundTrip = (input.tripScope ?? "round_trip") === "round_trip";
  const legs = isRoundTrip ? 2 : 1;
  const reserveNm = ((input.reserveMinutes ?? 30) / 60) * aircraft.tas;
  const usableRangeNm = Math.max(0, aircraft.fuelRange - reserveNm);

  const canRefuel = aircraft.fuelType != null && destination.fuels.some((f) => f.type === aircraft.fuelType);
  const refuelRequired = isRoundTrip && distanceNm * 2 > usableRangeNm;
  const withinRange = distanceNm <= usableRangeNm && (!refuelRequired || canRefuel);

  const groundTimeHours = (((input.departureGroundMinutes ?? 0) + (input.arrivalGroundMinutes ?? 0)) / 60) * legs;
  const timeHours = distanceNm / aircraft.tas;
  const tripTimeHours = round2(timeHours * legs + groundTimeHours);
  const fuelUsedLiters = timeHours * aircraft.fuelConsumption;
  const tripFuelLiters = fuelUsedLiters * legs;

  const fuelCost = round2(tripFuelLiters * (input.fuelPricePerLiter ?? 0));
  const estimatedCost = round2(fuelCost + round2(tripTimeHours * aircraft.hourlyCost) + (destination.landingFee ?? 0));

  return {
    distanceNm: round1(distanceNm),
    timeHours: round2(timeHours),
    fuelUsedLiters: round1(fuelUsedLiters),
    tripTimeHours,
    tripFuelLiters: round1(tripFuelLiters),
    fuelCost,
    estimatedCost,
    refuelRequired,
    canRefuel,
    usableRangeNm: round1(usableRangeNm),
    withinRange,
  };
}

/** computeTrip, or null when the destination is out of reach or breaks the query's limits. */
export function estimateLeg(
  aircraft: PlannerAircraft,
  input: PlannerQueryInput,
  destination: PlannerDestination,
): LegEstimate | null {
  const trip = computeTrip(aircraft, input, destination);
  const distanceNm = trip.distanceNm;
  if (distanceNm < 0.5) return null; // the departure field itself
  if (input.minDistanceNm && distanceNm < input.minDistanceNm) return null;
  if (input.maxDistanceNm && distanceNm > input.maxDistanceNm) return null;
  if (!trip.withinRange) return null;
  if (input.searchMode === "time" && input.maxTimeMinutes !== undefined && trip.tripTimeHours * 60 > input.maxTimeMinutes) {
    return null;
  }
  if (input.searchMode === "cost" && input.maxCost !== undefined && trip.estimatedCost > input.maxCost) {
    return null;
  }
  const { usableRangeNm: _range, withinRange: _within, ...leg } = trip;
  return leg;
}

export interface Place {
  latitude: number;
  longitude: number;
}

export interface NightCheck {
  arrivalAt: string;
  returnAt: string | null;
  nightOperation: boolean;
}

/** Outside [sunrise − 30 min, sunset + 30 min] at that field on that day. */
export function isAeronauticalNight(at: Date, place: Place): boolean {
  const sun = computeSunTimes(at.toISOString().slice(0, 10), place.latitude, place.longitude);
  if (!sun.aeronauticalDayStart || !sun.aeronauticalDayEnd) return false; // no sunset at French latitudes
  const t = at.getTime();
  return t < Date.parse(sun.aeronauticalDayStart) || t > Date.parse(sun.aeronauticalDayEnd);
}

/**
 * Timeline from off-block at the departure field: taxi out, flight, taxi in,
 * then for a round trip the stay and the same way back. Each take-off and
 * landing is checked against aeronautical night at its own field.
 */
export function checkNight(
  input: TripInput,
  leg: Pick<LegEstimate, "timeHours">,
  departure: Place,
  destination: Place,
): NightCheck | null {
  if (!input.departureTime) return null;
  const minute = 60_000;
  const taxiOut = (input.departureGroundMinutes ?? 0) * minute;
  const taxiIn = (input.arrivalGroundMinutes ?? 0) * minute;
  const flight = leg.timeHours * 3_600_000;

  const takeOff = Date.parse(input.departureTime) + taxiOut;
  const landing = takeOff + flight;
  const events: [number, Place][] = [[takeOff, departure], [landing, destination]];
  let returnLanding: number | null = null;

  if ((input.tripScope ?? "round_trip") === "round_trip") {
    const returnTakeOff = landing + taxiIn + (input.stayMinutes ?? 60) * minute + taxiOut;
    returnLanding = returnTakeOff + flight;
    events.push([returnTakeOff, destination], [returnLanding, departure]);
  }

  return {
    arrivalAt: new Date(landing).toISOString(),
    returnAt: returnLanding == null ? null : new Date(returnLanding).toISOString(),
    nightOperation: events.some(([at, place]) => isAeronauticalNight(new Date(at), place)),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
