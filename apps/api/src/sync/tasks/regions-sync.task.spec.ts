import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRegionsSyncTask } from "./regions-sync.task";

/**
 * Regions sync (Nominatim reverse geocoding).
 *
 * The monthly full run rewrites city/region for every aerodrome. When
 * Nominatim answers with an error or an empty address, the task must leave
 * the existing values alone instead of writing nulls over source data.
 */

function buildPrisma(rows: Array<Record<string, unknown>>) {
  return {
    aerodrome: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function mockNominatim(responses: Array<Record<string, unknown> | Error>) {
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return { ok: true, json: async () => next };
    }),
  );
}

const aerodromes = [
  { id: "a1", name: "Alpha", latitude: 48.1, longitude: 2.1, city: "Old city", region: "Old region" },
  { id: "a2", name: "Bravo", latitude: 44.1, longitude: 5.1, city: "Keep", region: "Keep" },
];

describe("runRegionsSyncTask", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("updates city and region from a full Nominatim answer", async () => {
    const prisma = buildPrisma([aerodromes[0]!]);
    mockNominatim([{ address: { town: "Chartres", state: "Centre-Val de Loire" } }]);

    const result = await runRegionsSyncTask(prisma as never, { forceAll: true });

    expect(prisma.aerodrome.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: expect.objectContaining({ city: "Chartres", region: "Centre-Val de Loire" }),
    });
    expect(result).toMatchObject({ updated: 1, unresolved: 0, errors: 0 });
  });

  it("never writes nulls when Nominatim returns an error payload", async () => {
    const prisma = buildPrisma([aerodromes[0]!]);
    mockNominatim([{ error: "Unable to geocode" }]);

    const result = await runRegionsSyncTask(prisma as never, { forceAll: true });

    expect(prisma.aerodrome.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ updated: 0, unresolved: 1, errors: 0 });
  });

  it("only writes the fields Nominatim actually resolved", async () => {
    const prisma = buildPrisma([aerodromes[1]!]);
    mockNominatim([{ address: { state: "Provence-Alpes-Côte d'Azur" } }]);

    await runRegionsSyncTask(prisma as never, { forceAll: true });

    const call = prisma.aerodrome.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(call.data).toMatchObject({ region: "Provence-Alpes-Côte d'Azur" });
    expect(call.data).not.toHaveProperty("city");
  });

  it("counts a network failure as an error and moves on", async () => {
    const prisma = buildPrisma(aerodromes);
    mockNominatim([new Error("ECONNRESET"), { address: { city: "Gap", state: "Provence-Alpes-Côte d'Azur" } }]);

    const promise = runRegionsSyncTask(prisma as never, { forceAll: true });
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).toMatchObject({ updated: 1, errors: 1 });
    expect(result.failures[0]).toContain("Alpha");
  });

  it("maps legacy region names to the current ones", async () => {
    const prisma = buildPrisma([aerodromes[0]!]);
    mockNominatim([{ address: { village: "X", state: "Nord-Pas-de-Calais-Picardie" } }]);

    await runRegionsSyncTask(prisma as never, { forceAll: true });

    expect(prisma.aerodrome.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ region: "Hauts-de-France" }) }),
    );
  });
});
