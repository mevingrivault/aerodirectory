import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MetarService } from "./metar.service";

/**
 * Weather is fetched live from CheckWX at request time, so the service has
 * to survive an outage (no hang, nothing cached) and must not hammer the
 * API for aerodromes without a station.
 */

const METAR = {
  icao: "LFPO",
  raw_text: "METAR LFPO 311530Z 05010KT CAVOK 15/07 Q1028 NOSIG",
  observed: new Date(Date.now() - 60_000).toISOString(),
  station: { name: "Paris Orly" },
  barometer: { hpa: 1028 },
};

function checkwx(data: unknown[], status = 200) {
  return new Response(JSON.stringify({ results: data.length, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function build(apiKey: string | null = "key") {
  const store = new Map<string, unknown>();
  const cache = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
  const config = { get: vi.fn(() => apiKey ?? undefined) };
  const service = new MetarService(config as never, cache as never);
  return { service, cache };
}

const fetchMock = vi.fn<typeof fetch>();
const timeout = () => new DOMException("timed out", "TimeoutError");

describe("MetarService", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the aerodrome's own METAR, with a timeout on the call", async () => {
    fetchMock.mockResolvedValueOnce(checkwx([METAR])).mockResolvedValueOnce(checkwx([]));
    const { service } = build();

    const result = await service.getWeather("LFPO", 48.72, 2.38);

    expect(result).toMatchObject({ icao: "LFPO", stationName: "Paris Orly", isNearest: false, taf: null });
    expect(result?.metar?.pressure_hpa).toBe(1028);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/metar/LFPO/decoded");
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to the nearest station when the aerodrome has no METAR", async () => {
    fetchMock
      .mockResolvedValueOnce(checkwx([]))
      .mockResolvedValueOnce(checkwx([{ ...METAR, position: { distance: { nautical_miles: 11 } } }]))
      .mockResolvedValueOnce(checkwx([]));
    const { service } = build();

    const result = await service.getWeather("LFPN", 48.749, 2.106);

    expect(result).toMatchObject({ icao: "LFPO", isNearest: true, distanceNm: 11 });
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/metar/lat/48.7490/lon/2.1060/decoded");
  });

  it("does not put an invalid ICAO code in the URL", async () => {
    fetchMock.mockResolvedValueOnce(checkwx([]));
    const { service } = build();

    await service.getWeather("../x", 48.7, 2.1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/metar/lat/");
  });

  it("caches the absence of a station", async () => {
    fetchMock.mockResolvedValueOnce(checkwx([]));
    const { service, cache } = build();

    expect(await service.getWeather(null, 45, 3)).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { result: null }, 15 * 60);

    expect(await service.getWeather(null, 45, 3)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache an outage", async () => {
    fetchMock.mockRejectedValue(timeout());
    const { service, cache } = build();

    expect(await service.getWeather("LFPO", 48.72, 2.38)).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("keeps a METAR without its TAF only briefly when the TAF call fails", async () => {
    fetchMock.mockResolvedValueOnce(checkwx([METAR])).mockRejectedValueOnce(timeout());
    const { service, cache } = build();

    const result = await service.getWeather("LFPO", 48.72, 2.38);

    expect(result?.metar).not.toBeNull();
    expect(result?.taf).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.anything(), 5 * 60);
  });

  it("serves the cached result without calling the API", async () => {
    fetchMock.mockResolvedValueOnce(checkwx([METAR])).mockResolvedValueOnce(checkwx([]));
    const { service } = build();

    await service.getWeather("LFPO", 48.72, 2.38);
    await service.getWeather("LFPO", 48.72, 2.38);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null without calling CheckWX when no API key is set", async () => {
    const { service } = build(null);

    expect(await service.getWeather("LFPO", 48.72, 2.38)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
