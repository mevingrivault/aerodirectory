import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import type { OverpassElement } from "../services/overpass/overpass.client";

// ─── Public types ──────────────────────────────────────────────────────────

export type AccommodationCategory = "camping" | "hotel" | "chambre_hotes";

export interface NearbyAccommodation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  category: AccommodationCategory;
  stars: number | null;
  rooms: number | null;
  capacity: number | null;
  phone: string | null;
  website: string | null;
  wheelchair: boolean | null;
  osmType: "node" | "way" | "relation";
  osmId: number;
}

export interface NearbyAccommodationResult {
  aerodromeId: string;
  radiusMeters: number;
  accommodations: NearbyAccommodation[];
  pilotServices: {
    accommodation: {
      available: boolean;
      source: "nearby_places";
      walkableThresholdMeters: number;
      matchingPlacesCount: number;
    };
  };
}

// ─── Cache types ───────────────────────────────────────────────────────────

interface MemoryCacheEntry {
  data: NearbyAccommodationResult;
  cachedAt: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_RADIUS_METERS = 10_000;
const WALKABLE_THRESHOLD_METERS = 3_000;

// ─── OSM tags → category ───────────────────────────────────────────────────

const CAMPING_TAGS = new Set(["camp_site", "caravan_site"]);
const HOTEL_TAGS = new Set(["hotel", "motel", "hostel"]);

function classifyAccommodation(tags: Record<string, string>): AccommodationCategory {
  const tourism = tags["tourism"] ?? "";
  if (CAMPING_TAGS.has(tourism)) return "camping";
  if (HOTEL_TAGS.has(tourism)) return "hotel";
  return "chambre_hotes";
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class AccommodationService {
  private readonly logger = new Logger(AccommodationService.name);
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
  private readonly redis: Redis | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
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
        this.logger.log("Cache hébergements : Redis activé");
      } catch {
        this.redis = null;
        this.logger.warn("Connexion Redis échouée — cache mémoire utilisé");
      }
    } else {
      this.redis = null;
      this.logger.log("Cache hébergements : mémoire (REDIS_URL non défini)");
    }
  }

  async getNearbyAccommodations(
    aerodromeId: string,
    radiusMeters: number = DEFAULT_RADIUS_METERS,
  ): Promise<NearbyAccommodationResult> {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: aerodromeId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!aerodrome) throw new NotFoundException("Aerodrome not found");

    const cacheKey = `accommodation:v1:${aerodromeId}:${radiusMeters}`;
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      this.logger.debug(`Cache trouvé — ${cacheKey}`);
      return cached;
    }

    this.logger.log(
      `Récupération des hébergements près de ${aerodromeId} (rayon=${radiusMeters}m) via DB locale`,
    );

    const elements = await queryOsmAccommodations(
      this.prisma,
      aerodrome.latitude,
      aerodrome.longitude,
      radiusMeters,
    );

    const accommodations = elements
      .map((el) => normalizeAccommodation(el, aerodrome.latitude, aerodrome.longitude))
      .filter((a): a is NearbyAccommodation => a !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const walkableCount = accommodations.filter(
      (a) => a.distanceMeters <= WALKABLE_THRESHOLD_METERS,
    ).length;

    const result: NearbyAccommodationResult = {
      aerodromeId,
      radiusMeters,
      accommodations,
      pilotServices: {
        accommodation: {
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

  // ─── Cache helpers ────────────────────────────────────────────────────────

  private async cacheGet(key: string): Promise<NearbyAccommodationResult | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as NearbyAccommodationResult) : null;
      } catch {
        // Redis indisponible — repli sur le cache mémoire
      }
    }
    const entry = this.memoryCache.get(key);
    if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.data;
    return null;
  }

  private async cacheSet(key: string, data: NearbyAccommodationResult): Promise<void> {
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

// ─── OSM DB query ──────────────────────────────────────────────────────────

function degreeBbox(lat: number, lon: number, radiusMeters: number) {
  const deltaLat = radiusMeters / 111_320;
  const deltaLon = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    latMin: lat - deltaLat, latMax: lat + deltaLat,
    lonMin: lon - deltaLon, lonMax: lon + deltaLon,
  };
}

async function queryOsmAccommodations(
  prisma: PrismaService,
  lat: number,
  lon: number,
  radiusMeters: number,
): Promise<OverpassElement[]> {
  const bbox = degreeBbox(lat, lon, radiusMeters);

  const pois = await prisma.osmPoi.findMany({
    where: {
      category: "ACCOMMODATION",
      lat: { gte: bbox.latMin, lte: bbox.latMax },
      lon: { gte: bbox.lonMin, lte: bbox.lonMax },
    },
  });

  return pois.map((poi) => {
    const [osmType, osmIdStr] = poi.osmId.split("/") as [string, string];
    return {
      type: (osmType === "way" ? "way" : osmType === "relation" ? "relation" : "node") as OverpassElement["type"],
      id: parseInt(osmIdStr, 10),
      lat: poi.lat,
      lon: poi.lon,
      tags: poi.tags as Record<string, string>,
    };
  });
}

// ─── Normalization ─────────────────────────────────────────────────────────

function parseBool(val: string | undefined): boolean | null {
  if (val === "yes") return true;
  if (val === "no") return false;
  return null;
}

function haversineMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
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

function normalizeAccommodation(
  el: OverpassElement,
  aeroLat: number,
  aeroLon: number,
): NearbyAccommodation | null {
  const tags = el.tags ?? {};
  const name = tags["name"]?.trim();
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const starsRaw = tags["stars"] ?? tags["tourism:stars"];
  const stars = starsRaw ? parseInt(starsRaw, 10) || null : null;
  const roomsRaw = tags["rooms"];
  const rooms = roomsRaw ? parseInt(roomsRaw, 10) || null : null;
  const capacityRaw = tags["capacity"];
  const capacity = capacityRaw ? parseInt(capacityRaw, 10) || null : null;

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    lat,
    lon,
    distanceMeters: Math.round(haversineMeters(aeroLat, aeroLon, lat, lon)),
    category: classifyAccommodation(tags),
    stars,
    rooms,
    capacity,
    phone: tags["phone"] ?? tags["contact:phone"] ?? null,
    website: tags["website"] ?? tags["contact:website"] ?? null,
    wheelchair: parseBool(tags["wheelchair"]),
    osmType: el.type,
    osmId: el.id,
  };
}
