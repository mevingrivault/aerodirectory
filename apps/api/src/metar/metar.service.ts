import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CacheService } from "../common/cache.service";

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
const NO_DATA_TTL_SECONDS = 15 * 60;    // no station around: ask again later
const FETCH_TIMEOUT_MS = 8_000;
const ICAO_PATTERN = /^[A-Z0-9]{4}$/;

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

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {
    this.apiKey = this.config.get<string>("CHECKWX_API_KEY") ?? null;
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

    const icao = icaoCode && ICAO_PATTERN.test(icaoCode) ? icaoCode : null;
    const cacheKey = `weather:v2:${icao ?? `${lat.toFixed(4)},${lon.toFixed(4)}`}`;
    // Wrapped so that "no station around" can be cached too.
    const cached = await this.cache.get<{ result: WeatherResult | null }>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache météo trouvé — ${cacheKey}`);
      return cached.result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawMetar: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawTaf: any = null;
    let isNearest = false;
    let stationIcao = icao;
    let stationName: string | null = null;
    let distanceNm: number | undefined;
    let bearingDeg: number | undefined;
    let upstreamFailed = false;
    const track = <T>(value: T | undefined): T | null => {
      if (value === undefined) upstreamFailed = true;
      return value ?? null;
    };

    // 1. Try by ICAO
    if (icao) {
      rawMetar = track(await this.fetchFirst(`/metar/${icao}/decoded`));
      if (rawMetar) {
        stationName = rawMetar.station?.name ?? null;
        rawTaf = track(await this.fetchFirst(`/taf/${icao}/decoded`));
      }
    }

    // 2. Fallback: nearest by coordinates
    if (!rawMetar) {
      rawMetar = track(
        await this.fetchFirst(`/metar/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/decoded`),
      );
      if (rawMetar) {
        isNearest = true;
        stationIcao = rawMetar.icao ?? null;
        stationName = rawMetar.station?.name ?? null;
        distanceNm = rawMetar.position?.distance?.nautical_miles;
        bearingDeg = rawMetar.position?.bearing?.degrees;
        if (stationIcao && ICAO_PATTERN.test(stationIcao)) {
          rawTaf = track(await this.fetchFirst(`/taf/${stationIcao}/decoded`));
        }
      }
    }

    if (!rawMetar && !rawTaf) {
      // An outage is not cached: the next request retries.
      if (!upstreamFailed) await this.cache.set(cacheKey, { result: null }, NO_DATA_TTL_SECONDS);
      return null;
    }

    const result = this.buildResult(rawMetar, rawTaf, {
      icao: stationIcao ?? "UNKN",
      stationName,
      isNearest,
      distanceNm,
      bearingDeg,
    });

    // A partial result (the TAF call failed) is kept only briefly.
    const ttl = upstreamFailed ? CACHE_TTL_MIN_SECONDS : computeTtlSeconds(result.metar?.observedAt);
    this.logger.debug(`Cache météo TTL=${ttl}s pour ${cacheKey}`);
    await this.cache.set(cacheKey, { result }, ttl);
    return result;
  }

  // ─── CheckWX fetch helper ─────────────────────────────────────────────────

  /** First decoded report, null when there is none, undefined when CheckWX failed. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchFirst(path: string): Promise<any | null | undefined> {
    try {
      const res = await fetch(`${CHECKWX_BASE}${path}`, {
        headers: { "X-API-Key": this.apiKey! },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`CheckWX ${path} : HTTP ${res.status}`);
        return undefined;
      }
      const json = (await res.json()) as { results: number; data: unknown[] };
      return json.results > 0 ? json.data[0] : null;
    } catch (e) {
      this.logger.warn(`CheckWX ${path} : ${String(e)}`);
      return undefined;
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
            pressure_hpa: rawMetar.barometer?.hpa ?? rawMetar.barometer?.hPa ?? rawMetar.barometer?.mb
              ?? (rawMetar.barometer?.inhg != null ? Math.round(rawMetar.barometer.inhg * 33.8639) : null)
              ?? (() => { const m = (rawMetar.raw_text ?? "").match(/\bQ(\d{4})\b/); return m ? parseInt(m[1], 10) : null; })(),
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
              const dir = f.wind?.direction;
              return ({
              from: f.change?.period?.from ?? f.timestamp?.from ?? f.period?.date_from ?? f.date_from ?? "",
              to: f.change?.period?.to ?? f.timestamp?.to ?? f.period?.date_to ?? f.date_to ?? "",
              changeIndicator: (!f.change?.code || f.change?.code === "INITIAL") ? null : (f.change?.code ?? null),
              wind: f.wind
                ? {
                    degrees: dir === "VRB" || dir == null ? null : (typeof dir === "number" ? dir : Number(dir) || null),
                    speed_kts: f.wind.speed?.kts ?? f.wind.speed_kts ?? 0,
                    gust_kts: f.wind.gust?.kts ?? f.wind.gust_kts ?? null,
                    cardinal: dir === "VRB" ? "VRB" : (f.wind.cardinal ?? null),
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

}
