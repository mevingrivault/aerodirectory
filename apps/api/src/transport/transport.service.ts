import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import type { OverpassElement } from "../services/overpass/overpass.client";

// ─── Public types ──────────────────────────────────────────────────────────

export type TransportType = "bus" | "tram" | "train" | "other";
export type TransportSubType = "station" | "stop" | "platform";

export interface OsmSource {
  type: "node" | "way" | "relation";
  id: number;
}

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
  // Level 2
  bench: boolean | null;
  lit: boolean | null;
  routeRef: string[];
  localRef: string | null;
  osmSources: OsmSource[];
}

export interface NearbyTransportResult {
  aerodromeId: string;
  radiusMeters: number;
  transports: NearbyTransport[];
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
const CLUSTER_RADIUS_METERS = 30;
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

    const cacheKey = `transport:v2:${aerodromeId}:${radiusMeters}`;
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      this.logger.debug(`Cache trouvé — ${cacheKey}`);
      return cached;
    }

    this.logger.log(
      `Récupération des transports près de ${aerodromeId} (rayon=${radiusMeters}m) via Overpass`,
    );

    let elements: OverpassElement[] = [];
    let overpassSucceeded = false;
    try {
      elements = await this.fetchTransportOverpass(
        aerodrome.latitude,
        aerodrome.longitude,
        radiusMeters,
      );
      overpassSucceeded = true;
    } catch (error) {
      this.logger.error(`Échec Overpass pour ${aerodromeId} : ${error}`);
    }

    // Normalize all elements, filtering invalid ones
    const normalized = elements
      .map((el) => normalizeTransport(el, aerodrome.latitude, aerodrome.longitude))
      .filter((s): s is NearbyTransport => s !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    // Deduplicate via spatial + name clustering
    const transports = clusterTransports(normalized);

    const walkableCount = transports.filter(
      (s) => s.distanceMeters <= WALKABLE_THRESHOLD_METERS,
    ).length;

    const result: NearbyTransportResult = {
      aerodromeId,
      radiusMeters,
      transports,
      pilotServices: {
        transport: {
          available: walkableCount > 0,
          source: "nearby_places",
          walkableThresholdMeters: WALKABLE_THRESHOLD_METERS,
          matchingStopsCount: walkableCount,
        },
      },
    };

    // Ne mettre en cache que si Overpass a répondu correctement
    if (overpassSucceeded) {
      await this.cacheSet(cacheKey, result);
    }

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

// ─── Clustering / deduplication ────────────────────────────────────────────

function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function namesAreSimilar(a: string, b: string): boolean {
  if (!a || !b) return true;
  const na = normalizeNameForComparison(a);
  const nb = normalizeNameForComparison(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

const TYPE_PRIORITY: Record<TransportType, number> = { train: 4, tram: 3, bus: 2, other: 1 };
const SUBTYPE_PRIORITY: Record<TransportSubType, number> = { station: 3, platform: 2, stop: 1 };

function mergeTransports(base: NearbyTransport, incoming: NearbyTransport): void {
  // Best name = non-empty, longest
  if (incoming.name && incoming.name.length > base.name.length) {
    base.name = incoming.name;
  }
  base.operator ??= incoming.operator;
  base.network ??= incoming.network;
  base.ref ??= incoming.ref;
  base.wheelchair ??= incoming.wheelchair;
  base.shelter ??= incoming.shelter;
  base.bench ??= incoming.bench;
  base.lit ??= incoming.lit;
  base.localRef ??= incoming.localRef;

  // Merge routeRef (deduplicated union)
  const merged = new Set([...base.routeRef, ...incoming.routeRef]);
  base.routeRef = [...merged];

  // Keep highest-priority subType
  if (SUBTYPE_PRIORITY[incoming.subType] > SUBTYPE_PRIORITY[base.subType]) {
    base.subType = incoming.subType;
  }

  // Keep highest-priority type
  if (TYPE_PRIORITY[incoming.type] > TYPE_PRIORITY[base.type]) {
    base.type = incoming.type;
  }

  base.osmSources.push(...incoming.osmSources);
}

function clusterTransports(stops: NearbyTransport[]): NearbyTransport[] {
  const clusters: NearbyTransport[] = [];

  for (const stop of stops) {
    let merged = false;

    for (const cluster of clusters) {
      const d = haversineMeters(stop.lat, stop.lon, cluster.lat, cluster.lon);
      if (d <= CLUSTER_RADIUS_METERS && namesAreSimilar(stop.name, cluster.name)) {
        mergeTransports(cluster, stop);
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push({
        ...stop,
        osmSources: [...stop.osmSources],
        routeRef: [...stop.routeRef],
      });
    }
  }

  return clusters;
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

function parseRouteRef(tags: Record<string, string>): string[] {
  const raw = tags["route_ref"] ?? tags["routes"] ?? "";
  if (!raw) return [];
  return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

function fallbackName(type: TransportType): string {
  if (type === "train") return "Gare";
  if (type === "tram") return "Arrêt de tram";
  if (type === "bus") return "Arrêt de bus";
  return "Arrêt";
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

  const rawName =
    tags["name"]?.trim() ||
    tags["local_ref"]?.trim() ||
    tags["ref"]?.trim() ||
    "";

  return {
    id: `osm-${el.type}-${el.id}`,
    name: rawName || fallbackName(type),
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
    bench: parseBool(tags["bench"]),
    lit: parseBool(tags["lit"]),
    routeRef: parseRouteRef(tags),
    localRef: tags["local_ref"] ?? null,
    osmSources: [{ type: el.type, id: el.id }],
  };
}
