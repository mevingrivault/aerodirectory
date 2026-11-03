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

const PAVED_SURFACES = ["ASPHALT", "CONCRETE"];

/**
 * Destinations the aircraft can use. Winch-only fields (gliders) and
 * heliports never are; private fields only on request, since landing there
 * needs the owner's permission. PPR fields stay in and are flagged.
 * A hangar or webcam counts whether it comes from the import or from an
 * approved member report.
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
  const surfaces = filters.pavedRunway
    ? aircraft.allowedSurfaces.filter((s) => PAVED_SURFACES.includes(s))
    : aircraft.allowedSurfaces;
  const either: Prisma.AerodromeWhereInput[] = [];
  if (filters.hasHangar) {
    either.push({
      OR: [
        { hasHangars: true },
        {
          communityInfos: {
            some: {
              kind: "HANGAR",
              contentStatus: "APPROVED",
              OR: [
                { data: { path: ["availability"], equals: "YES" } },
                { data: { path: ["availability"], equals: "ON_REQUEST" } },
              ],
            },
          },
        },
      ],
    });
  }
  if (filters.hasWebcam) {
    either.push({
      OR: [{ webcams: { some: {} } }, { communityInfos: { some: { kind: "WEBCAM", contentStatus: "APPROVED" } } }],
    });
  }

  return {
    status: "OPEN",
    winchOnly: false,
    aerodromeType: { not: "HELIPORT" },
    ...(input.includePrivate ? {} : { privateUse: false }),
    runways: {
      some: {
        length: { gte: aircraft.minRunwayLength },
        surface: { in: surfaces as Prisma.EnumSurfaceTypeFilter["in"] },
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
    ...(either.length > 0 ? { AND: either } : {}),
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

const parisDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

/** Midnights (French time) between landing and the next take-off: the nights a parking fee is due. */
export function nightsParked(landing: number, takeOff: number): number {
  if (takeOff <= landing) return 0;
  const days = (Date.parse(parisDay.format(takeOff)) - Date.parse(parisDay.format(landing))) / 86_400_000;
  return Math.max(0, Math.round(days));
}

/** Nights parked at the destination of a round trip; 0 without a departure time. */
export function stayNights(input: TripInput, leg: Pick<LegEstimate, "timeHours">): number {
  if (!input.departureTime || (input.tripScope ?? "round_trip") !== "round_trip") return 0;
  const minute = 60_000;
  const landing = Date.parse(input.departureTime) + (input.departureGroundMinutes ?? 0) * minute + leg.timeHours * 3_600_000;
  const returnTakeOff =
    landing + ((input.arrivalGroundMinutes ?? 0) + (input.stayMinutes ?? 60) + (input.departureGroundMinutes ?? 0)) * minute;
  return nightsParked(landing, returnTakeOff);
}

// ─── Routes with stops (briefing) ─────────────────────────────────────────

export interface RoutePoint extends Place {
  id: string;
  fuels: { type: string }[];
  landingFee?: number | null;
  parkingPerNight?: number | null;
}

export type RouteInput = Pick<
  TripInput,
  "reserveMinutes" | "departureGroundMinutes" | "arrivalGroundMinutes" | "fuelPricePerLiter" | "departureTime" | "stayMinutes"
>;

export interface RouteLeg {
  fromId: string;
  toId: string;
  distanceNm: number;
  timeHours: number;
  fuelLiters: number;
  refuelBefore: boolean;
  withinRange: boolean;
  takeOffAt: string | null;
  landingAt: string | null;
}

export interface RouteEstimate {
  legs: RouteLeg[];
  distanceNm: number;
  flightTimeHours: number;
  tripTimeHours: number;
  tripFuelLiters: number;
  usableRangeNm: number;
  withinRange: boolean;
  fuelCost: number;
  landingFees: number;
  parkingFees: number;
  estimatedCost: number;
  nightOperation: boolean | null;
}

/**
 * Flies the points in order, straight lines, no wind. The tank is full at
 * the start. At each stop that sells the aircraft's fuel, it is filled when
 * what is left would not reach the next field selling it (or the end). Every
 * landing pays its fee except one back at the start; each stop lasts
 * `stayMinutes`. A two-point return [A, B, A] gives the same answer as
 * computeTrip, plus parking.
 */
export function computeRoute(aircraft: PlannerAircraft, input: RouteInput, points: RoutePoint[]): RouteEstimate {
  const minute = 60_000;
  const taxiOut = input.departureGroundMinutes ?? 0;
  const taxiIn = input.arrivalGroundMinutes ?? 0;
  const usableRangeNm = Math.max(0, aircraft.fuelRange - ((input.reserveMinutes ?? 30) / 60) * aircraft.tas);
  const sells = (p: RoutePoint) => aircraft.fuelType != null && p.fuels.some((f) => f.type === aircraft.fuelType);
  const distances = points.slice(1).map((p, i) => haversineNm(points[i]!.latitude, points[i]!.longitude, p.latitude, p.longitude));
  const last = points.length - 1;
  const backHome = points.length > 1 && points[last]!.id === points[0]!.id;

  let onBoardNm = usableRangeNm;
  let clock = input.departureTime ? Date.parse(input.departureTime) : null;
  const events: [number, Place][] = [];
  let landingFees = 0;
  let parkingFees = 0;
  const legs: RouteLeg[] = [];

  distances.forEach((distanceNm, i) => {
    const from = points[i]!;
    const to = points[i + 1]!;
    let refuelBefore = false;
    if (i > 0 && sells(from)) {
      // Distance to cover before the next chance to refuel.
      let needed = 0;
      for (let j = i; j < distances.length; j++) {
        needed += distances[j]!;
        if (sells(points[j + 1]!)) break;
      }
      if (onBoardNm < needed) {
        onBoardNm = usableRangeNm;
        refuelBefore = true;
      }
    }
    const withinRange = distanceNm <= onBoardNm;
    onBoardNm -= distanceNm;

    const timeHours = distanceNm / aircraft.tas;
    let takeOffAt: string | null = null;
    let landingAt: string | null = null;
    if (clock != null) {
      const takeOff = clock + taxiOut * minute;
      const landing = takeOff + timeHours * 3_600_000;
      events.push([takeOff, from], [landing, to]);
      takeOffAt = toMinute(takeOff);
      landingAt = toMinute(landing);
      clock = landing + (taxiIn + (i + 1 < distances.length ? input.stayMinutes ?? 60 : 0)) * minute;
      if (i + 1 < distances.length && to.parkingPerNight) {
        parkingFees += nightsParked(landing, clock + taxiOut * minute) * to.parkingPerNight;
      }
    }
    if (!(backHome && i + 1 === last)) landingFees += to.landingFee ?? 0;

    legs.push({
      fromId: from.id,
      toId: to.id,
      distanceNm: round1(distanceNm),
      timeHours: round2(timeHours),
      fuelLiters: round1(timeHours * aircraft.fuelConsumption),
      refuelBefore,
      withinRange,
      takeOffAt,
      landingAt,
    });
  });

  const flightTimeHours = distances.reduce((sum, d) => sum + d / aircraft.tas, 0);
  const tripTimeHours = round2(flightTimeHours + (distances.length * (taxiOut + taxiIn)) / 60);
  const tripFuelLiters = flightTimeHours * aircraft.fuelConsumption;
  const fuelCost = round2(tripFuelLiters * (input.fuelPricePerLiter ?? 0));

  return {
    legs,
    distanceNm: round1(distances.reduce((a, b) => a + b, 0)),
    flightTimeHours: round2(flightTimeHours),
    tripTimeHours,
    tripFuelLiters: round1(tripFuelLiters),
    usableRangeNm: round1(usableRangeNm),
    withinRange: legs.every((l) => l.withinRange),
    fuelCost,
    landingFees: round2(landingFees),
    parkingFees: round2(parkingFees),
    estimatedCost: round2(fuelCost + round2(tripTimeHours * aircraft.hourlyCost) + landingFees + parkingFees),
    nightOperation: clock == null ? null : events.some(([at, place]) => isAeronauticalNight(new Date(at), place)),
  };
}

const toMinute = (ms: number) => new Date(Math.round(ms / 60_000) * 60_000).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
