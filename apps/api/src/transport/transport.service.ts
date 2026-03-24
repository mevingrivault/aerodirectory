import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import type { OverpassElement } from "../services/overpass/overpass.client";

// ─── Public types ──────────────────────────────────────────────────────────

export type TransportType = "bus" | "tram" | "train" | "other";
export type TransportSubType = "station" | "stop" | "platform";

export interface NearbyTransport {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  type: TransportType;
  subType: TransportSubType;
  operator: string | null;
  network: string | null;
  ref: string | null;
  wheelchair: boolean | null;
  shelter: boolean | null;
  osmType: "node" | "way" | "relation";
  osmId: number;
}

export interface NearbyTransportResult {
  aerodromeId: string;
  radiusMeters: number;
  stops: NearbyTransport[];
  pilotServices: {
    transport: {
      available: boolean;
      source: "nearby_places";
      walkableThresholdMeters: number;
      matchingStopsCount: number;
    };
  };
}

// ─── Cache types ───────────────────────────────────────────────────────────

interface MemoryCacheEntry {
  data: NearbyTransportResult;
  cachedAt: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_RADIUS_METERS = 3_000;
const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const WALKABLE_THRESHOLD_METERS = 1_000;
const TIMEOUT_MS = 25_000;

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
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
        this.logger.log("Cache transports : Redis activé");
      } catch {
        this.redis = null;
        this.logger.warn("Connexion Redis échouée — cache mémoire utilisé");
      }
    } else {
      this.redis = null;
      this.logger.log("Cache transports : mémoire (REDIS_URL non défini)");
    }
  }

  async getNearbyTransport(
    aerodromeId: string,
    radiusMeters: number = DEFAULT_RADIUS_METERS,
  ): Promise<NearbyTransportResult> {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: aerodromeId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!aerodrome) throw new NotFoundException("Aerodrome not found");

    const cacheKey = `transport:${aerodromeId}:${radiusMeters}`;
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      this.logger.debug(`Cache trouvé — ${cacheKey}`);
      return cached;
    }

    this.logger.log(
      `Récupération des transports près de ${aerodromeId} (rayon=${radiusMeters}m) via Overpass`,
    );

    let elements: OverpassElement[] = [];
    try {
      elements = await this.fetchTransportOverpass(
        aerodrome.latitude,
        aerodrome.longitude,
        radiusMeters,
      );
    } catch (error) {
      this.logger.error(`Échec Overpass pour ${aerodromeId} : ${error}`);
    }

    // Deduplicate by osm type+id (same stop may match several tag filters)
    const seen = new Set<string>();
    const stops = elements
      .filter((el) => {
        const key = `${el.type}-${el.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((el) => normalizeTransport(el, aerodrome.latitude, aerodrome.longitude))
      .filter((s): s is NearbyTransport => s !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const walkableCount = stops.filter(
      (s) => s.distanceMeters <= WALKABLE_THRESHOLD_METERS,
    ).length;

    const result: NearbyTransportResult = {
      aerodromeId,
      radiusMeters,
      stops,
      pilotServices: {
        transport: {
          available: walkableCount > 0,
          source: "nearby_places",
          walkableThresholdMeters: WALKABLE_THRESHOLD_METERS,
          matchingStopsCount: walkableCount,
        },
      },
    };
    await this.cacheSet(cacheKey, result);

    return result;
  }

  // ─── Overpass ─────────────────────────────────────────────────────────────

  private async fetchTransportOverpass(
    lat: number,
    lon: number,
    radiusMeters: number,
  ): Promise<OverpassElement[]> {
    const r = radiusMeters;
    const query = [
      "[out:json][timeout:25];",
      "(",
      `  node["highway"="bus_stop"](around:${r},${lat},${lon});`,
      `  node["public_transport"="platform"](around:${r},${lat},${lon});`,
      `  node["public_transport"="stop_position"](around:${r},${lat},${lon});`,
      `  node["railway"="tram_stop"](around:${r},${lat},${lon});`,
      `  node["railway"="station"](around:${r},${lat},${lon});`,
      `  node["railway"="halt"](around:${r},${lat},${lon});`,
      `  way["public_transport"="platform"](around:${r},${lat},${lon});`,
      `  relation["public_transport"="platform"](around:${r},${lat},${lon});`,
      ");",
      "out center tags;",
    ].join("\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(this.overpassEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Overpass error: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Cache helpers ─────────────────────────────────────────────────────────

  private async cacheGet(key: string): Promise<NearbyTransportResult | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as NearbyTransportResult) : null;
      } catch {
        // Redis indisponible — repli sur le cache mémoire
      }
    }
    const entry = this.memoryCache.get(key);
    if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.data;
    return null;
  }

  private async cacheSet(key: string, data: NearbyTransportResult): Promise<void> {
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

function classifyTransport(tags: Record<string, string>): {
  type: TransportType;
  subType: TransportSubType;
} {
  const railway = tags["railway"];
  const highway = tags["highway"];
  const pt = tags["public_transport"];

  if (railway === "station") return { type: "train", subType: "station" };
  if (railway === "halt") return { type: "train", subType: "stop" };
  if (railway === "tram_stop") return { type: "tram", subType: "stop" };
  if (highway === "bus_stop") {
    return { type: "bus", subType: pt === "platform" ? "platform" : "stop" };
  }

  if (pt === "platform") {
    if (railway) {
      return { type: railway.includes("tram") ? "tram" : "train", subType: "platform" };
    }
    return { type: "bus", subType: "platform" };
  }

  if (pt === "stop_position") {
    if (railway) {
      return { type: railway.includes("tram") ? "tram" : "train", subType: "stop" };
    }
    return { type: "bus", subType: "stop" };
  }

  return { type: "other", subType: "stop" };
}

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

function normalizeTransport(
  el: OverpassElement,
  aeroLat: number,
  aeroLon: number,
): NearbyTransport | null {
  const tags = el.tags ?? {};

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const { type, subType } = classifyTransport(tags);

  return {
    id: `osm-${el.type}-${el.id}`,
    name: tags["name"]?.trim() || tags["ref"]?.trim() || "Arrêt sans nom",
    lat,
    lon,
    distanceMeters: Math.round(haversineMeters(aeroLat, aeroLon, lat, lon)),
    type,
    subType,
    operator: tags["operator"] ?? null,
    network: tags["network"] ?? null,
    ref: tags["ref"] ?? null,
    wheelchair: parseBool(tags["wheelchair"]),
    shelter: parseBool(tags["shelter"]),
    osmType: el.type,
    osmId: el.id,
  };
}
