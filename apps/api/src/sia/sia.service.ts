import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "../common/cache.service";
import { ad2Url, airacCycle, SIA_ICAO, vacUrl, type AiracCycle } from "./airac";

export interface SiaDocuments {
  /** VAC PDF of the cycle in force, if the SIA publishes one for this aerodrome. */
  vacUrl: string | null;
  /** AD 2 page of the eAIP, published for the larger aerodromes only. */
  ad2Url: string | null;
  /** Effective date of the cycle the links belong to, "2026-10-29". */
  airac: string | null;
}

type Presence = "found" | "missing" | "error";

const USER_AGENT = "Navventura/1.0 (https://navventura.fr; contact@navventura.fr)";
const HEAD_TIMEOUT_MS = 8_000;
// "Not published" is re-checked daily: the new cycle's folder may appear late on its effective date.
const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;
const MIN_TTL_SECONDS = 5 * 60;
// How long after a cycle starts we still try the previous one.
const SWITCHOVER_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

const NONE: SiaDocuments = { vacUrl: null, ad2Url: null, airac: null };

/**
 * Finds the SIA documents of an aerodrome for the AIRAC cycle in force.
 * One HEAD request per document, cached until the cycle ends; a failed
 * check is not cached.
 */
@Injectable()
export class SiaService {
  private readonly logger = new Logger(SiaService.name);

  constructor(private readonly cache: CacheService) {}

  async getDocuments(icaoCode: string | null, now = new Date()): Promise<SiaDocuments> {
    if (!icaoCode || !SIA_ICAO.test(icaoCode)) return NONE;

    const cycle = airacCycle(now);
    const cacheKey = `sia:docs:${cycle.isoDate}:${icaoCode}`;
    const cached = await this.cache.get<SiaDocuments>(cacheKey);
    if (cached) return cached;

    let result = await this.check(icaoCode, cycle);
    // On the first days of a cycle the SIA may still serve only the previous one.
    if (!result.found && now.getTime() - cycle.effective.getTime() < SWITCHOVER_GRACE_MS) {
      const previous = await this.check(icaoCode, airacCycle(now, -1));
      result = { ...previous, failed: result.failed || previous.failed };
    }
    if (result.failed && !result.found) return NONE;

    const untilNextCycle = Math.floor((cycle.next.getTime() - now.getTime()) / 1000);
    const ttl = result.found
      ? Math.max(MIN_TTL_SECONDS, untilNextCycle)
      : Math.max(MIN_TTL_SECONDS, Math.min(NOT_FOUND_TTL_SECONDS, untilNextCycle));
    await this.cache.set(cacheKey, result.documents, ttl);
    return result.documents;
  }

  private async check(icao: string, cycle: AiracCycle) {
    const [vac, ad2] = await Promise.all([this.presence(vacUrl(icao, cycle)), this.presence(ad2Url(icao, cycle))]);
    const found = vac === "found" || ad2 === "found";
    return {
      found,
      failed: vac === "error" || ad2 === "error",
      documents: {
        vacUrl: vac === "found" ? vacUrl(icao, cycle) : null,
        ad2Url: ad2 === "found" ? ad2Url(icao, cycle) : null,
        airac: found ? cycle.isoDate : null,
      } satisfies SiaDocuments,
    };
  }

  private async presence(url: string): Promise<Presence> {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        redirect: "manual",
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      });
      if (res.status === 200) return "found";
      if (res.status === 404 || res.status === 410) return "missing";
      this.logger.warn(`SIA ${url} : HTTP ${res.status}`);
      return "error";
    } catch (error) {
      this.logger.warn(`SIA ${url} : ${String(error)}`);
      return "error";
    }
  }
}
