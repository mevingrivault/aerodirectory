import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ad2Url, airacCycle, vacUrl } from "./airac";
import { SiaService } from "./sia.service";

/**
 * VAC and AD 2 links point at the SIA's current cycle, which is the only one
 * online: the cycle maths and the availability check must both be right.
 */

describe("airacCycle", () => {
  it.each([
    ["2024-01-25T00:00:00Z", "2024-01-25", "25_JAN_2024"],
    ["2026-11-02T12:00:00Z", "2026-10-29", "29_OCT_2026"],
    ["2026-10-28T23:59:59Z", "2026-10-01", "01_OCT_2026"],
    ["2026-11-26T00:00:00Z", "2026-11-26", "26_NOV_2026"],
  ])("%s is in the cycle of %s", (at, isoDate, folder) => {
    expect(airacCycle(new Date(at))).toMatchObject({ isoDate, folder });
  });

  it("gives the previous cycle and the next effective date", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(airacCycle(now, -1).isoDate).toBe("2026-10-01");
    expect(airacCycle(now).next.toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });

  it("builds the SIA URLs", () => {
    const cycle = airacCycle(new Date("2026-11-02T12:00:00Z"));
    expect(vacUrl("LFPN", cycle)).toBe(
      "https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_29_OCT_2026/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.LFPN.pdf",
    );
    expect(ad2Url("LFPN", cycle)).toBe(
      "https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_29_OCT_2026/FRANCE/AIRAC-2026-10-29/html/eAIP/FR-AD-2.LFPN-fr-FR.html",
    );
  });
});

describe("SiaService", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const NOW = new Date("2026-11-10T12:00:00Z"); // mid-cycle

  function build() {
    const store = new Map<string, unknown>();
    const cache = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown, _ttlSeconds: number) => {
        store.set(key, value);
      }),
    };
    return { service: new SiaService(cache as never), cache };
  }

  const respond = (statusFor: (url: string) => number) =>
    fetchMock.mockImplementation(async (input) => new Response(null, { status: statusFor(String(input)) }));

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the documents the SIA publishes, cached until the next cycle", async () => {
    respond((url) => (url.endsWith(".pdf") ? 200 : 404)); // VAC only, like LFFQ
    const { service, cache } = build();

    const docs = await service.getDocuments("LFFQ", NOW);

    expect(docs).toEqual({ vacUrl: expect.stringContaining("AD-2.LFFQ.pdf"), ad2Url: null, airac: "2026-10-29" });
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("HEAD");
    const ttl = cache.set.mock.calls[0]![2];
    expect(ttl).toBe((Date.parse("2026-11-26T00:00:00Z") - NOW.getTime()) / 1000);

    await service.getDocuments("LFFQ", NOW);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks nothing for codes outside the eAIP France", async () => {
    const { service } = build();
    expect(await service.getDocuments("TFFR", NOW)).toEqual({ vacUrl: null, ad2Url: null, airac: null });
    expect(await service.getDocuments(null, NOW)).toEqual({ vacUrl: null, ad2Url: null, airac: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches 'not published' for a day only", async () => {
    respond(() => 404);
    const { service, cache } = build();

    await service.getDocuments("LFMO", NOW);

    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { vacUrl: null, ad2Url: null, airac: null }, 86_400);
  });

  it("does not cache a failed check", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const { service, cache } = build();

    expect((await service.getDocuments("LFPN", NOW)).vacUrl).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("falls back to the previous cycle on the first days of a new one", async () => {
    respond((url) => (url.includes("01_OCT_2026") ? 200 : 404));
    const { service } = build();

    const docs = await service.getDocuments("LFPN", new Date("2026-10-29T06:00:00Z"));

    expect(docs.airac).toBe("2026-10-01");
    expect(docs.vacUrl).toContain("eAIP_01_OCT_2026");
  });
});
