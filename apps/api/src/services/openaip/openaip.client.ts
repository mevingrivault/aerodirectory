/**
 * Centralized client for the openAIP REST API.
 *
 * All calls to the external openAIP service go through this module.
 * Handles authentication, pagination, rate-limit retries, and base URL.
 *
 * API docs: https://www.openaip.net/docs
 */

const DEFAULT_BASE_URL = "https://api.core.openaip.net/api";
const DEFAULT_PAGE_LIMIT = 100;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

// ─── Types for openAIP API responses ─────────────────────

export interface OpenAipPaginatedResponse<T> {
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
  items: T[];
}

export interface OpenAipAirport {
  _id: string;
  name: string;
  icaoCode?: string;
  iataCode?: string;
  altIdentifier?: string;
  type: number; // 0-17, see openAIP docs
  country: string; // ISO 2-letter
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  elevation?: {
    value: number;
    unit: number; // 0=meters, 1=feet
    referenceDatum: number; // 0=MSL
  };
  runways?: OpenAipRunway[];
  frequencies?: OpenAipFrequency[];
  services?: {
    fuelTypes?: number[]; // 0=SuperPLUS, 1=AVGAS, 2=JetA, 3=JetA1, 4=JetB, 5=Diesel, 6=UL91
    handlingFacilities?: number[];
    passengerFacilities?: number[];
  };
  magneticDeclination?: number;
  ppr?: boolean;
  private?: boolean;
  skydiveActivity?: boolean;
  winchOnly?: boolean;
}

export interface OpenAipRunway {
  designator?: string;
  trueHeading?: number;
  mainRunway?: boolean;
  dimension?: {
    length?: { value: number; unit: number }; // unit: 0=m, 1=ft
    width?: { value: number; unit: number };
  };
  surface?: {
    mainComposite: number; // 0=asphalt, 1=concrete, 2=grass, 3=sand, 4=gravel, 5=water, ...
    composition?: number[];
  };
  pilotCtrlLighting?: boolean;
  operations?: number;
}

export interface OpenAipFrequency {
  value: string; // e.g. "120.900"
  unit?: number; // 0=MHz
  type: number; // 0-21
  name?: string;
  primary?: boolean;
}

// Altitude reference: 0=MSL, 1=AGL, 2=FL (flight level)
export interface OpenAipAltitude {
  value: number;
  unit: number; // 0=feet, 1=meters
  referenceDatum: number;
}

export interface OpenAipAirspace {
  _id: string;
  name: string;
  type: number;         // 0-26, see schema comments
  icaoClass: number;    // 0=A,1=B,2=C,3=D,4=E,5=F,6=G,7=SPC
  activity: number;     // 0=All, 1=Parachute, 2=Aerobatic, etc.
  onDemand: boolean;
  onRequest: boolean;
  byNotam: boolean;
  specialAgreement: boolean;
  requestCompliance: boolean;
  country: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  upperLimit: OpenAipAltitude;
  lowerLimit: OpenAipAltitude;
  remarks?: string;
}

// ─── Client ──────────────────────────────────────────────

export class OpenAipClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    if (!apiKey) {
      throw new Error("OPENAIP_API_KEY is required");
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Fetch all airports for a given country, handling pagination automatically.
   */
  async getAirports(country = "FR"): Promise<OpenAipAirport[]> {
    const allItems: OpenAipAirport[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await this.fetchPage<OpenAipAirport>(
        "/airports",
        { country, page: String(page), limit: String(DEFAULT_PAGE_LIMIT) },
      );

      allItems.push(...response.items);
      totalPages = response.totalPages;

      console.log(
        `  [openAIP] Fetched page ${page}/${totalPages} — ${response.items.length} airports (total so far: ${allItems.length})`,
      );

      page++;
    } while (page <= totalPages);

    return allItems;
  }

  /**
   * Fetch a single airport by its openAIP _id.
   */
  async getAirportById(id: string): Promise<OpenAipAirport> {
    return this.fetchJson<OpenAipAirport>(`/airports/${id}`);
  }

  /**
   * Fetch all airspaces for a given country, handling pagination automatically.
   */
  async getAirspaces(country = "FR"): Promise<OpenAipAirspace[]> {
    const allItems: OpenAipAirspace[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await this.fetchPage<OpenAipAirspace>(
        "/airspaces",
        { country, page: String(page), limit: String(DEFAULT_PAGE_LIMIT) },
      );

      allItems.push(...response.items);
      totalPages = response.totalPages;

      console.log(
        `  [openAIP] Airspaces page ${page}/${totalPages} — ${response.items.length} items (total: ${allItems.length})`,
      );

      page++;
    } while (page <= totalPages);

    return allItems;
  }

  // ─── Internal ─────────────────────────────────────────

  private async fetchPage<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<OpenAipPaginatedResponse<T>> {
    return this.fetchJson<OpenAipPaginatedResponse<T>>(path, params);
  }

  private async fetchJson<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`  [openAIP] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
        await sleep(delay);
      }

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "x-openaip-api-key": this.apiKey,
            Accept: "application/json",
          },
        });

        // Rate limited — retry
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
          console.warn(`  [openAIP] Rate limited — waiting ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `openAIP API error: ${response.status} ${response.statusText} — ${body}`,
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on network errors or 429, not on 4xx/5xx
        if (
          lastError.message.includes("fetch failed") ||
          lastError.message.includes("ECONNREFUSED") ||
          lastError.message.includes("Rate limited")
        ) {
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new Error("openAIP request failed after retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
