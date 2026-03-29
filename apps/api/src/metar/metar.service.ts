import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WeatherWind {
  degrees: number | null;
  speed_kts: number;
  gust_kts: number | null;
  cardinal: string | null;
}

export interface WeatherCloud {
  code: string;
  base_ft: number | null;
  text: string | null;
}

export interface WeatherCondition {
  code: string;
  text: string;
}

export interface MetarData {
  raw: string;
  observedAt: string;
  wind: WeatherWind | null;
  visibility_meters: number | null;
  clouds: WeatherCloud[];
  temperature_c: number | null;
  dewpoint_c: number | null;
  humidity_percent: number | null;
  pressure_hpa: number | null;
  conditions: WeatherCondition[];
  flight_category: string | null;
}

export interface TafForecastPeriod {
  from: string;
  to: string;
  changeIndicator: string | null;
  wind?: WeatherWind;
  visibility_meters?: number | null;
  clouds?: { code: string; base_ft: number | null }[];
  conditions?: WeatherCondition[];
}

export interface TafData {
  raw: string;
  issuedAt: string;
  validFrom: string;
  validTo: string;
  forecast: TafForecastPeriod[];
}

export interface WeatherResult {
  icao: string;
  stationName: string | null;
  isNearest: boolean;
  distanceNm?: number;
  bearingDeg?: number;
  metar: MetarData | null;
  taf: TafData | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CHECKWX_BASE = "https://api.checkwx.com/v2";
const CACHE_TTL_MIN_SECONDS = 5 * 60;   // never cache less than 5 min
const CACHE_TTL_MAX_SECONDS = 65 * 60;  // cap at 65 min (hourly stations + buffer)
const METAR_VALIDITY_SECONDS = 35 * 60; // METAR valid ~30 min, +5 min buffer

/** Compute TTL until the next METAR is expected, based on observation time. */
function computeTtlSeconds(observedAt: string | null | undefined): number {
  if (!observedAt) return CACHE_TTL_MAX_SECONDS;
  const observed = new Date(observedAt).getTime();
  if (isNaN(observed)) return CACHE_TTL_MAX_SECONDS;
  const nextExpected = observed + METAR_VALIDITY_SECONDS * 1000;
  const remaining = Math.floor((nextExpected - Date.now()) / 1000);
  return Math.min(CACHE_TTL_MAX_SECONDS, Math.max(CACHE_TTL_MIN_SECONDS, remaining));
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class MetarService {
  private readonly logger = new Logger(MetarService.name);
  private readonly apiKey: string | null;
  private readonly redis: Redis | null;
  private readonly memoryCache = new Map<string, { data: WeatherResult; cachedAt: number; ttlMs: number }>();

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>("CHECKWX_API_KEY") ?? null;

    const redisUrl = this.config.get<string>("REDIS_URL");
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
        });
        this.redis.on("error", (err: Error) =>
          this.logger.warn(`Redis error: ${err.message}`),
        );
      } catch {
        this.redis = null;
      }
    } else {
      this.redis = null;
    }
  }

  async getWeather(
    icaoCode: string | null,
    lat: number,
    lon: number,
  ): Promise<WeatherResult | null> {
    if (!this.apiKey) {
      this.logger.warn("CHECKWX_API_KEY non défini — météo indisponible");
      return null;
    }

    const cacheKey = `weather:${icaoCode ?? `${lat.toFixed(4)},${lon.toFixed(4)}`}`;
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      this.logger.debug(`Cache météo trouvé — ${cacheKey}`);
      return cached;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawMetar: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawTaf: any = null;
    let isNearest = false;
    let stationIcao = icaoCode;
    let stationName: string | null = null;
    let distanceNm: number | undefined;
    let bearingDeg: number | undefined;

    // 1. Try by ICAO
    if (icaoCode) {
      rawMetar = await this.fetchMetar(icaoCode);
      if (rawMetar) {
        stationName = rawMetar.station?.name ?? null;
        rawTaf = await this.fetchTaf(icaoCode);
      }
    }

    // 2. Fallback: nearest by coordinates
    if (!rawMetar) {
      rawMetar = await this.fetchNearestMetar(lat, lon);
      if (rawMetar) {
        isNearest = true;
        stationIcao = rawMetar.icao ?? null;
        stationName = rawMetar.station?.name ?? null;
        distanceNm = rawMetar.position?.distance?.nautical_miles;
        bearingDeg = rawMetar.position?.bearing?.degrees;
        if (stationIcao) {
          rawTaf = await this.fetchTaf(stationIcao);
        }
      }
    }

    if (!rawMetar && !rawTaf) return null;

    const result = this.buildResult(rawMetar, rawTaf, {
      icao: stationIcao ?? "UNKN",
      stationName,
      isNearest,
      distanceNm,
      bearingDeg,
    });

    const ttl = computeTtlSeconds(result.metar?.observedAt);
    this.logger.debug(`Cache météo TTL=${ttl}s pour ${cacheKey}`);
    await this.cacheSet(cacheKey, result, ttl);
    return result;
  }

  // ─── CheckWX fetch helpers ────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchMetar(icao: string): Promise<any | null> {
    try {
      const res = await fetch(`${CHECKWX_BASE}/metar/${icao}/decoded`, {
        headers: { "X-API-Key": this.apiKey! },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { results: number; data: unknown[] };
      return json.results > 0 ? json.data[0] : null;
    } catch (e) {
      this.logger.warn(`METAR fetch failed for ${icao}: ${String(e)}`);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchTaf(icao: string): Promise<any | null> {
    try {
      const res = await fetch(`${CHECKWX_BASE}/taf/${icao}/decoded`, {
        headers: { "X-API-Key": this.apiKey! },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { results: number; data: unknown[] };
      return json.results > 0 ? json.data[0] : null;
    } catch (e) {
      this.logger.warn(`TAF fetch failed for ${icao}: ${String(e)}`);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchNearestMetar(lat: number, lon: number): Promise<any | null> {
    try {
      const res = await fetch(
        `${CHECKWX_BASE}/metar/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/decoded`,
        { headers: { "X-API-Key": this.apiKey! } },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { results: number; data: unknown[] };
      return json.results > 0 ? json.data[0] : null;
    } catch (e) {
      this.logger.warn(`Nearest METAR fetch failed for ${lat},${lon}: ${String(e)}`);
      return null;
    }
  }

  // ─── Response builder ─────────────────────────────────────────────────────

  private buildResult(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawMetar: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawTaf: any,
    meta: {
      icao: string;
      stationName: string | null;
      isNearest: boolean;
      distanceNm?: number;
      bearingDeg?: number;
    },
  ): WeatherResult {
    return {
      icao: meta.icao,
      stationName: meta.stationName,
      isNearest: meta.isNearest,
      distanceNm: meta.distanceNm,
      bearingDeg: meta.bearingDeg,
      metar: rawMetar
        ? {
            raw: rawMetar.raw_text ?? "",
            observedAt: rawMetar.observed ?? "",
            wind: rawMetar.wind
              ? {
                  degrees: rawMetar.wind.degrees ?? null,
                  speed_kts: rawMetar.wind.speed_kts ?? rawMetar.wind.speed?.kts ?? 0,
                  gust_kts: rawMetar.wind.gust_kts ?? rawMetar.wind.gust?.kts ?? null,
                  cardinal: rawMetar.wind.degrees_from ?? rawMetar.wind.cardinal ?? null,
                }
              : null,
            visibility_meters: rawMetar.visibility?.meters_float ?? rawMetar.visibility?.meters ?? null,
            clouds: (rawMetar.clouds ?? []).map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c: any) => ({
                code: c.code ?? "",
                base_ft: c.base_feet_agl ?? null,
                text: c.text ?? null,
              }),
            ),
            temperature_c: rawMetar.temperature?.celsius ?? null,
            dewpoint_c: rawMetar.dewpoint?.celsius ?? null,
            humidity_percent: rawMetar.humidity?.percent ?? null,
            pressure_hpa: rawMetar.barometer?.hpa ?? rawMetar.barometer?.mb ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            conditions: (rawMetar.conditions ?? []).map((c: any) => ({
              code: c.code ?? "",
              text: c.text ?? "",
            })),
            flight_category: rawMetar.flight_category ?? null,
          }
        : null,
      taf: rawTaf
        ? {
            raw: rawTaf.raw_text ?? "",
            issuedAt: rawTaf.timestamp?.issued ?? rawTaf.issued ?? "",
            validFrom: rawTaf.timestamp?.from ?? rawTaf.period?.date_from ?? "",
            validTo: rawTaf.timestamp?.to ?? rawTaf.period?.date_to ?? "",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            forecast: (rawTaf.forecast ?? []).map((f: any) => {
              // Debug: log first period keys to understand CheckWX TAF structure
              if (rawTaf.forecast?.indexOf(f) === 0) {
                this.logger.log(`TAF forecast[0] raw: ${JSON.stringify(f).slice(0, 500)}`);
              }
              return ({
              from: f.timestamp?.from ?? f.period?.date_from ?? f.date_from ?? "",
              to: f.timestamp?.to ?? f.period?.date_to ?? f.date_to ?? "",
              changeIndicator: f.change?.indicator?.code ?? null,
              wind: f.wind
                ? {
                    degrees: f.wind.degrees ?? null,
                    speed_kts: f.wind.speed_kts ?? f.wind.speed?.kts ?? 0,
                    gust_kts: f.wind.gust_kts ?? f.wind.gust?.kts ?? null,
                    cardinal: f.wind.degrees_from ?? f.wind.cardinal ?? null,
                  }
                : undefined,
              visibility_meters: f.visibility?.meters_float ?? f.visibility?.meters ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              clouds: (f.clouds ?? []).map((c: any) => ({
                code: c.code ?? "",
                base_ft: c.base_feet_agl ?? null,
              })),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              conditions: (f.conditions ?? []).map((c: any) => ({
                code: c.code ?? "",
                text: c.text ?? "",
              })),
            });
            }),
          }
        : null,
    };
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────

  private async cacheGet(key: string): Promise<WeatherResult | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as WeatherResult) : null;
      } catch {
        // fallback to memory
      }
    }
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    // Memory cache: reuse the same TTL logic — expire when entry is older than max TTL
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.data;
  }

  private async cacheSet(key: string, data: WeatherResult, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
        return;
      } catch {
        // fallback to memory
      }
    }
    this.memoryCache.set(key, { data, cachedAt: Date.now(), ttlMs: ttlSeconds * 1000 });
  }
}
