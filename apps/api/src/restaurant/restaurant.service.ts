import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import {
  fetchOverpassNearby,
  type OverpassElement,
} from "../services/overpass/overpass.client";

// ─── Public types ──────────────────────────────────────────────────────────

export interface NearbyRestaurant {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  accessibility: "walkable" | "nearby";
  amenity: string; // "restaurant" | "cafe" | "bar"
  cuisine: string[];
  isOpenNow: boolean | null; // null = could not determine
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  address: {
    street: string | null;
    postcode: string | null;
    city: string | null;
  };
  takeaway: boolean | null;
  delivery: boolean | null;
  outdoorSeating: boolean | null;
  osmType: "node" | "way" | "relation";
  osmId: number;
}

export interface PilotServiceAvailability {
  available: boolean;
  source: "nearby_places";
  walkableThresholdMeters: number;
  matchingPlacesCount: number;
}

export interface NearbyRestaurantsResult {
  aerodromeId: string;
  radiusMeters: number;
  restaurants: NearbyRestaurant[];
  pilotServices: {
    restaurant: PilotServiceAvailability;
  };
}

// ─── Cache types ───────────────────────────────────────────────────────────

interface MemoryCacheEntry {
  data: NearbyRestaurantsResult;
  cachedAt: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (in-memory)
const CACHE_TTL_SECONDS = 12 * 60 * 60;    // 12 hours (Redis EX)
const DEFAULT_RADIUS_METERS = 3_000;
const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

// ─── Accessibility thresholds ──────────────────────────────────────────────
// Walkable: pilot can walk from the aerodrome to the place during a stopover
// Nearby: reachable but not on foot
const WALKABLE_THRESHOLD_METERS = 1_000;
const NEARBY_THRESHOLD_METERS = 3_000;

// Amenity categories that contribute to the "Restaurant" pilot service
const RESTAURANT_AMENITIES = new Set(["restaurant", "cafe"]);

// Amenities fetched — extend to add more POI types later
const AMENITIES = ["restaurant", "cafe", "bar"] as const;

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class RestaurantService {
  private readonly logger = new Logger(RestaurantService.name);

  // In-memory fallback cache
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();

  // Optional Redis client (null when REDIS_URL is not set or unreachable)
  private readonly redis: Redis | null;

  private readonly overpassEndpoint: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.overpassEndpoint =
      this.config.get<string>("OVERPASS_ENDPOINT") ?? DEFAULT_OVERPASS_ENDPOINT;

    const redisUrl = this.config.get<string>("REDIS_URL");
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
        });
        this.redis.on("error", (err: Error) =>
          this.logger.warn(`Erreur Redis : ${err.message}`),
        );
        this.logger.log("Cache restaurants : Redis activé");
      } catch {
        this.redis = null;
        this.logger.warn("Connexion Redis échouée — cache mémoire utilisé");
      }
    } else {
      this.redis = null;
      this.logger.log("Cache restaurants : mémoire (REDIS_URL non défini)");
    }
  }

  async getNearbyRestaurants(
    aerodromeId: string,
    radiusMeters: number = DEFAULT_RADIUS_METERS,
  ): Promise<NearbyRestaurantsResult> {
    // Resolve aerodrome coordinates from DB
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: aerodromeId },
      select: { id: true, latitude: true, longitude: true },
    });

    if (!aerodrome) throw new NotFoundException("Aerodrome not found");

    const cacheKey = `restaurants:${aerodromeId}:${radiusMeters}`;
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      this.logger.debug(`Cache trouvé — ${cacheKey}`);
      return cached;
    }

    this.logger.log(
      `Récupération des établissements près de ${aerodromeId} (rayon=${radiusMeters}m) via Overpass`,
    );

    let elements: OverpassElement[] = [];
    try {
      elements = await fetchOverpassNearby(
        aerodrome.latitude,
        aerodrome.longitude,
        radiusMeters,
        [...AMENITIES],
        this.overpassEndpoint,
      );
    } catch (error) {
      this.logger.error(`Échec Overpass pour ${aerodromeId} : ${error}`);
      // Retourne un résultat vide plutôt que de planter — Overpass peut être temporairement indisponible
    }

    const restaurants = elements
      .map((el) =>
        normalizeRestaurant(el, aerodrome.latitude, aerodrome.longitude),
      )
      .filter((r): r is Omit<NearbyRestaurant, "accessibility"> => r !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .map((r) => ({
        ...r,
        accessibility:
          r.distanceMeters <= WALKABLE_THRESHOLD_METERS
            ? ("walkable" as const)
            : ("nearby" as const),
      }));

    const walkableCount = restaurants.filter(
      (r) => r.accessibility === "walkable" && RESTAURANT_AMENITIES.has(r.amenity),
    ).length;

    const result: NearbyRestaurantsResult = {
      aerodromeId,
      radiusMeters,
      restaurants,
      pilotServices: {
        restaurant: {
          available: walkableCount > 0,
          source: "nearby_places",
          walkableThresholdMeters: WALKABLE_THRESHOLD_METERS,
          matchingPlacesCount: walkableCount,
        },
      },
    };
    await this.cacheSet(cacheKey, result);

    return result;
  }

  async searchNearby(
    lat: number,
    lon: number,
    radiusMeters: number,
    q?: string,
  ): Promise<NearbyRestaurant[]> {
    let elements: OverpassElement[] = [];
    try {
      elements = await fetchOverpassNearby(
        lat,
        lon,
        radiusMeters,
        [...AMENITIES],
        this.overpassEndpoint,
      );
    } catch (error) {
      this.logger.error(`Échec Overpass (recherche libre) : ${error}`);
    }

    let results = elements
      .map((el) => normalizeRestaurant(el, lat, lon))
      .filter((r): r is Omit<NearbyRestaurant, "accessibility"> => r !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .map((r) => ({
        ...r,
        accessibility:
          r.distanceMeters <= WALKABLE_THRESHOLD_METERS
            ? ("walkable" as const)
            : ("nearby" as const),
      }));

    if (q) {
      const lq = q.toLowerCase();
      results = results.filter(
        (r) =>
          r.name.toLowerCase().includes(lq) ||
          r.cuisine.some((c) => c.toLowerCase().includes(lq)) ||
          (r.address.city?.toLowerCase().includes(lq) ?? false),
      );
    }

    return results;
  }

  // ─── Cache helpers ──────────────────────────────────────────────────────

  private async cacheGet(key: string): Promise<NearbyRestaurantsResult | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as NearbyRestaurantsResult) : null;
      } catch {
        // Redis indisponible — repli sur le cache mémoire
      }
    }
    const entry = this.memoryCache.get(key);
    if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.data;
    return null;
  }

  private async cacheSet(
    key: string,
    data: NearbyRestaurantsResult,
  ): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(data));
        return;
      } catch {
        // Écriture Redis échouée — repli sur le cache mémoire
      }
    }
    this.memoryCache.set(key, { data, cachedAt: Date.now() });
  }
}

// ─── Normalization ─────────────────────────────────────────────────────────

function normalizeRestaurant(
  el: OverpassElement,
  aeroLat: number,
  aeroLon: number,
): Omit<NearbyRestaurant, "accessibility"> | null {
  const tags = el.tags ?? {};
  const name = tags["name"]?.trim();
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const openingHours = tags["opening_hours"] ?? null;

  const cuisine = tags["cuisine"]
    ? tags["cuisine"]
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    lat,
    lon,
    distanceMeters: Math.round(haversineMeters(aeroLat, aeroLon, lat, lon)),
    amenity: tags["amenity"] ?? "restaurant",
    cuisine,
    isOpenNow: parseOpeningHours(openingHours),
    openingHours,
    phone: tags["phone"] ?? tags["contact:phone"] ?? null,
    website: tags["website"] ?? tags["contact:website"] ?? null,
    address: {
      street: tags["addr:street"] ?? null,
      postcode: tags["addr:postcode"] ?? null,
      city: tags["addr:city"] ?? null,
    },
    takeaway: parseBool(tags["takeaway"]),
    delivery: parseBool(tags["delivery"]),
    outdoorSeating: parseBool(tags["outdoor_seating"]),
    osmType: el.type,
    osmId: el.id,
  };
}

// ─── Opening hours parser ──────────────────────────────────────────────────

/**
 * Lightweight OSM opening_hours parser.
 * Handles the most common formats found on French POIs.
 * Returns null when the format is too complex to parse safely.
 *
 * Supported:
 *   24/7
 *   Mo-Fr 09:00-18:00
 *   Tu-Su 12:00-14:30,19:00-22:00   (comma-separated time ranges)
 *   Mo-Fr 11:00-15:00; Sa-Su 12:00-16:00
 *   Mo-Sa 08:00-20:00; Su off
 *   Mo,We,Fr 08:00-12:00
 */

const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const DAY_TO_JS: Record<string, number> = {
  Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0,
};

function expandDaySpec(spec: string): number[] {
  const days = new Set<number>();
  for (const token of spec.split(",")) {
    const t = token.trim();
    if (t.includes("-")) {
      const [from, to] = t.split("-").map((d) => d.trim());
      const fi = DAY_ORDER.indexOf(from as (typeof DAY_ORDER)[number]);
      const ti = DAY_ORDER.indexOf(to as (typeof DAY_ORDER)[number]);
      if (fi === -1 || ti === -1) continue;
      for (let i = fi; i <= ti; i++) {
        const key = DAY_ORDER[i];
        if (key !== undefined) {
          const d = DAY_TO_JS[key];
          if (d !== undefined) days.add(d);
        }
      }
    } else {
      const d = DAY_TO_JS[t];
      if (d !== undefined) days.add(d);
    }
  }
  return [...days];
}

function toMinutes(time: string): number {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

function parseOpeningHours(value: string | null): boolean | null {
  if (!value) return null;
  const str = value.trim();

  if (str === "24/7") return true;

  const now = new Date();
  const todayJs = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let anyRuleMatchedToday = false;

  for (const rawRule of str.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;

    // Skip month-based or PH-based rules (e.g. "Apr-Sep Mo-Fr …") — too complex
    if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|PH)/.test(rule)) {
      continue;
    }

    // Try to split into optional day-spec and time-spec
    // Day spec looks like "Mo-Fr", "Sa", "Mo,We,Fr"
    const dayTimeMatch = rule.match(
      /^([A-Z][a-z](?:[,-][A-Z][a-z])*(?:,[A-Z][a-z])*)\s+(.+)$/,
    );

    let daysForRule: number[];
    let timeSpec: string;

    if (dayTimeMatch) {
      daysForRule = expandDaySpec(dayTimeMatch[1] ?? "");
      timeSpec = (dayTimeMatch[2] ?? "").trim();
    } else if (/^\d{2}:\d{2}-\d{2}:\d{2}/.test(rule)) {
      // No day prefix — applies every day
      daysForRule = [0, 1, 2, 3, 4, 5, 6];
      timeSpec = rule;
    } else {
      // Unknown format for this rule — skip, don't abort
      continue;
    }

    if (!daysForRule.includes(todayJs)) continue;
    anyRuleMatchedToday = true;

    // "off" means explicitly closed today
    if (timeSpec === "off") continue;

    // Parse comma-separated time ranges: "12:00-14:30,19:00-22:00"
    for (const range of timeSpec.split(",")) {
      const m = range.trim().match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (!m || !m[1] || !m[2]) continue;
      const from = toMinutes(m[1]);
      const to = toMinutes(m[2]);
      // Overnight range: to < from (e.g. 22:00-02:00)
      const open =
        to > from
          ? nowMin >= from && nowMin < to
          : nowMin >= from || nowMin < to;
      if (open) return true;
    }
  }

  // If no rule applied to today, we can't determine open/closed
  if (!anyRuleMatchedToday) return null;

  return false;
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function parseBool(val: string | undefined): boolean | null {
  if (val === "yes") return true;
  if (val === "no") return false;
  return null;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
