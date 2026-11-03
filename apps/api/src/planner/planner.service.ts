import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AirspaceService } from "../airspace/airspace.service";
import {
  initialBearing,
  type AircraftProfileInput,
  type BriefingField,
  type BriefingQueryInput,
  type BriefingTrip,
  type PlannerQueryInput,
  type PlannerResult,
  type RouteAirspace,
  type RouteObstacle,
} from "@aerodirectory/shared";
import { buildDestinationWhere, checkNight, computeRoute, computeTrip, estimateLeg, stayNights, type RoutePoint } from "./planner.calc";
import {
  ROUTE_AIRSPACE_FLOOR_FT,
  ROUTE_AIRSPACE_TYPES,
  ROUTE_OBSTACLE_CORRIDOR_NM,
  legBoxes,
  routeEntryNm,
  routeOffset,
} from "./route-hazards";

/** Highest obstacles kept along a briefing route, out of all those in the corridor. */
const ROUTE_OBSTACLES_KEPT = 10;

const BRIEFING_FIELD_SELECT = {
  id: true,
  name: true,
  icaoCode: true,
  latitude: true,
  longitude: true,
  elevation: true,
  magneticDeclination: true,
} as const;

/** Magnetic = true − declination (east positive), in [0, 360). */
function magnetic(trueCourse: number, declination: number | null): number | null {
  return declination == null ? null : Math.round((((trueCourse - declination) % 360) + 360) % 360) % 360;
}

@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly airspaces: AirspaceService,
  ) {}

  // ─── Aircraft Profiles ──────────────────────────────

  async createProfile(userId: string, input: AircraftProfileInput) {
    return this.prisma.aircraftProfile.create({
      data: { userId, ...input },
    });
  }

  async getProfiles(userId: string) {
    return this.prisma.aircraftProfile.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
  }

  async updateProfile(
    userId: string,
    profileId: string,
    input: Partial<AircraftProfileInput>,
  ) {
    const profile = await this.prisma.aircraftProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    return this.prisma.aircraftProfile.update({
      where: { id: profileId },
      data: input,
    });
  }

  async deleteProfile(userId: string, profileId: string) {
    const profile = await this.prisma.aircraftProfile.findFirst({
      where: { id: profileId, userId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    await this.prisma.aircraftProfile.delete({ where: { id: profileId } });
  }

  // ─── Flight Planning ────────────────────────────────

  async plan(userId: string, input: PlannerQueryInput): Promise<PlannerResult[]> {
    const profile = await this.prisma.aircraftProfile.findFirst({
      where: { id: input.profileId, userId },
    });
    if (!profile) throw new NotFoundException("Aircraft profile not found");

    const aerodromes = await this.prisma.aerodrome.findMany({
      where: buildDestinationWhere(profile, input, userId),
      include: {
        runways: { select: { length: true } },
        fuels: { where: { available: true }, select: { type: true } },
      },
    });

    // A fee only adds to the cost, so what is out of reach without it stays out.
    const reachable = aerodromes.filter((ad) => estimateLeg(profile, input, ad));
    const reports = await this.memberReports(reachable.map((ad) => ad.id), profile);
    const departure = { latitude: input.departureLat, longitude: input.departureLng };

    const results: PlannerResult[] = [];
    for (const ad of reachable) {
      const report = reports.get(ad.id);
      const parkingNights = stayNights(input, computeTrip(profile, input, ad));
      const fee = report?.landingFee;
      const landingFee = fee ? fee.amount + parkingNights * (fee.parkingPerNight ?? 0) : null;
      const leg = estimateLeg(profile, input, { ...ad, landingFee });
      if (!leg) continue;
      const night = checkNight(input, leg, departure, ad);
      if (input.excludeNight && night?.nightOperation) continue;

      results.push({
        aerodrome: {
          id: ad.id,
          name: ad.name,
          icaoCode: ad.icaoCode,
          latitude: ad.latitude,
          longitude: ad.longitude,
          city: ad.city,
          region: ad.region,
          elevation: ad.elevation,
          hasRestaurant: ad.hasRestaurant,
          hasTransport: ad.hasTransport,
          hasBikes: ad.hasBikes,
          hasAccommodation: ad.hasAccommodation,
          fuels: ad.fuels.map((f) => f.type),
          maxRunwayLength: ad.runways.length > 0 ? Math.max(...ad.runways.map((r) => r.length)) : null,
          ppr: ad.ppr,
          privateUse: ad.privateUse,
          skydiveActivity: ad.skydiveActivity,
        },
        ...leg,
        landingFee: report?.landingFee ?? null,
        parkingNights,
        fuelPrice: report?.fuelPrice ?? null,
        arrivalAt: night?.arrivalAt ?? null,
        returnAt: night?.returnAt ?? null,
        nightOperation: night?.nightOperation ?? null,
      });
    }

    if (input.sortBy === "cost") {
      results.sort((a, b) => a.estimatedCost - b.estimatedCost);
    } else if (input.sortBy === "distance") {
      results.sort((a, b) => a.distanceNm - b.distanceNm);
    } else {
      results.sort((a, b) => a.timeHours - b.timeHours);
    }

    return results;
  }

  /**
   * The trip from the departure through the stops to the destination (and
   * straight back for a round trip), computed even when out of reach so the
   * briefing can say so.
   */
  async briefing(userId: string, input: BriefingQueryInput): Promise<BriefingTrip> {
    const ids = [input.departureId, ...input.viaIds, input.destinationId];
    const [profile, fields] = await Promise.all([
      this.prisma.aircraftProfile.findFirst({ where: { id: input.profileId, userId } }),
      this.prisma.aerodrome.findMany({
        where: { id: { in: [...new Set(ids)] } },
        select: { ...BRIEFING_FIELD_SELECT, fuels: { where: { available: true }, select: { type: true } } },
      }),
    ]);
    if (!profile) throw new NotFoundException("Aircraft profile not found");
    const byId = new Map(fields.map((f) => [f.id, f]));
    const route = ids.map((id) => byId.get(id));
    if (route.some((f) => !f)) throw new NotFoundException("Aérodrome introuvable.");
    const fieldsInOrder = route as NonNullable<(typeof route)[number]>[];

    const reports = await this.memberReports([...new Set(ids.slice(1))], profile);
    const points: (RoutePoint & (typeof fieldsInOrder)[number])[] = fieldsInOrder.map((f) => ({
      ...f,
      landingFee: reports.get(f.id)?.landingFee?.amount ?? null,
      parkingPerNight: reports.get(f.id)?.landingFee?.parkingPerNight ?? null,
    }));
    if (input.tripScope === "round_trip") points.push(points[0]!);

    const estimate = computeRoute(profile, input, points);
    const legs = estimate.legs.map((leg, i) => {
      const from = points[i]!;
      const to = points[i + 1]!;
      const trueCourse = initialBearing(from.latitude, from.longitude, to.latitude, to.longitude);
      return { ...leg, trueCourse, magneticCourse: magnetic(trueCourse, from.magneticDeclination) };
    });
    const hazards = await this.routeHazards(points);
    const field = ({ fuels: _fuels, ...f }: (typeof fieldsInOrder)[number]): BriefingField => f;
    const destination = fieldsInOrder[fieldsInOrder.length - 1]!;

    return {
      departure: field(fieldsInOrder[0]!),
      destination: field(destination),
      stops: fieldsInOrder.slice(1, -1).map(field),
      aircraft: {
        name: profile.name,
        tas: profile.tas,
        fuelConsumption: profile.fuelConsumption,
        fuelRange: profile.fuelRange,
        fuelType: profile.fuelType,
        category: profile.category,
        maxCrosswindKt: profile.maxCrosswindKt,
      },
      tripScope: input.tripScope,
      reserveMinutes: input.reserveMinutes,
      stayMinutes: input.stayMinutes,
      ...estimate,
      legs,
      landingFee: reports.get(destination.id)?.landingFee ?? null,
      fuelPrice: reports.get(destination.id)?.fuelPrice ?? null,
      departureTime: input.departureTime ?? null,
      ...hazards,
    };
  }

  /** Low airspaces the straight route enters, and the highest obstacles close to it, in route order. */
  private async routeHazards(points: RoutePoint[]) {
    const airspaces: RouteAirspace[] = [];
    for (const a of await this.airspaces.findAll()) {
      if (!ROUTE_AIRSPACE_TYPES.has(a.type)) continue;
      if (a.lowerLimitFt != null && a.lowerLimitFt > ROUTE_AIRSPACE_FLOOR_FT) continue;
      const alongNm = routeEntryNm(points, a.geometry);
      if (alongNm == null) continue;
      airspaces.push({
        id: a.id,
        name: a.name,
        type: a.type,
        icaoClass: a.icaoClass,
        lowerLimit: a.lowerLimit,
        upperLimit: a.upperLimit,
        onRequest: a.onRequest,
        onDemand: a.onDemand,
        alongNm: Math.round(alongNm * 10) / 10,
      });
    }
    airspaces.sort((a, b) => a.alongNm - b.alongNm);

    const candidates = await this.prisma.obstacle.findMany({
      where: { OR: legBoxes(points, ROUTE_OBSTACLE_CORRIDOR_NM) },
      select: { id: true, name: true, type: true, latitude: true, longitude: true, heightM: true, elevationM: true },
    });
    const near = candidates
      .map((o) => ({ ...o, ...routeOffset(points, o) }))
      .filter((o) => o.offsetNm <= ROUTE_OBSTACLE_CORRIDOR_NM);
    const top = (o: (typeof near)[number]) => o.elevationM ?? o.heightM ?? 0;
    const obstacles: RouteObstacle[] = near
      .sort((a, b) => top(b) - top(a))
      .slice(0, ROUTE_OBSTACLES_KEPT)
      .sort((a, b) => a.alongNm - b.alongNm)
      .map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        heightM: o.heightM,
        elevationM: o.elevationM,
        alongNm: Math.round(o.alongNm * 10) / 10,
        offsetNm: Math.round(o.offsetNm * 10) / 10,
      }));

    return { airspaces, obstacles, obstacleCount: near.length, obstacleCorridorNm: ROUTE_OBSTACLE_CORRIDOR_NM };
  }

  /**
   * Newest approved landing fee for the aircraft's category and fuel price for
   * its fuel, per aerodrome. Nothing is looked up for what the profile leaves blank.
   */
  private async memberReports(
    aerodromeIds: string[],
    profile: { category: string | null; fuelType: string | null },
  ) {
    const wanted = [
      ...(profile.category ? [{ kind: "LANDING_FEE" as const, key: profile.category }] : []),
      ...(profile.fuelType ? [{ kind: "FUEL_PRICE" as const, key: profile.fuelType }] : []),
    ];
    const byAerodrome = new Map<string, Pick<PlannerResult, "landingFee" | "fuelPrice">>();
    if (wanted.length === 0 || aerodromeIds.length === 0) return byAerodrome;

    const rows = await this.prisma.communityInfo.findMany({
      where: { aerodromeId: { in: aerodromeIds }, contentStatus: "APPROVED", OR: wanted },
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
      select: { aerodromeId: true, kind: true, data: true, observedAt: true },
    });

    for (const row of rows) {
      const entry = byAerodrome.get(row.aerodromeId) ?? { landingFee: null, fuelPrice: null };
      const data = row.data as Record<string, unknown>;
      const observedAt = row.observedAt.toISOString();
      if (row.kind === "LANDING_FEE" && !entry.landingFee && typeof data["landingFee"] === "number") {
        entry.landingFee = {
          amount: data["landingFee"],
          parkingPerNight: typeof data["parkingPerNight"] === "number" ? data["parkingPerNight"] : null,
          observedAt,
        };
      }
      if (row.kind === "FUEL_PRICE" && !entry.fuelPrice && typeof data["pricePerLiter"] === "number") {
        entry.fuelPrice = { pricePerLiter: data["pricePerLiter"], observedAt };
      }
      byAerodrome.set(row.aerodromeId, entry);
    }
    return byAerodrome;
  }
}
