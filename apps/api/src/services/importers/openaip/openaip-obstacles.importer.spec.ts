import { describe, it, expect, vi } from "vitest";
import { normalizeOpenAipObstacle, syncOpenAipObstacles } from "./openaip-obstacles.importer";
import type { OpenAipObstacle } from "../../openaip/openaip.client";

/**
 * Obstacles are shown to pilots around each aerodrome: types and heights
 * must come through right, and a broken openAIP answer must not wipe them.
 */

function obstacle(overrides: Partial<OpenAipObstacle> = {}): OpenAipObstacle {
  return {
    _id: "o1",
    name: " Éolienne E3 ",
    type: 3,
    geometry: { type: "Point", coordinates: [2.106, 48.75] },
    height: { value: 149.6, unit: 0 },
    elevation: { value: 312.2, unit: 0 },
    ...overrides,
  };
}

function build() {
  const tx = {
    obstacle: {
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
  return { prisma, tx };
}

describe("normalizeOpenAipObstacle", () => {
  it("maps type, position and heights in metres", () => {
    expect(normalizeOpenAipObstacle(obstacle())).toEqual({
      source: "openaip",
      sourceId: "o1",
      name: "Éolienne E3",
      type: "WIND_TURBINE",
      latitude: 48.75,
      longitude: 2.106,
      heightM: 150,
      elevationM: 312,
    });
  });

  it("keeps unknown types as generic obstacles and drops unusable heights", () => {
    const o = normalizeOpenAipObstacle(obstacle({ type: 42, height: { value: 30, unit: 1 }, elevation: undefined }));
    expect(o).toMatchObject({ type: "OBSTACLE", heightM: null, elevationM: null });
  });

  it("rejects a position out of range", () => {
    expect(normalizeOpenAipObstacle(obstacle({ geometry: { type: "Point", coordinates: [200, 48] } }))).toBeNull();
  });
});

describe("syncOpenAipObstacles", () => {
  it("replaces the table in one transaction, in batches", async () => {
    const { prisma, tx } = build();
    const items = Array.from({ length: 2500 }, (_, i) => obstacle({ _id: `o${i}`, type: i % 5 }));
    const client = { getObstacles: vi.fn().mockResolvedValue([...items, obstacle({ _id: "o0" })]) };

    const result = await syncOpenAipObstacles(prisma as never, "key", client);

    expect(client.getObstacles).toHaveBeenCalledWith("FR");
    expect(tx.obstacle.deleteMany).toHaveBeenCalledWith({ where: { source: "openaip" } });
    expect(tx.obstacle.createMany).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ fetched: 2501, imported: 2500, skipped: 1 });
    expect(result.byType["WIND_TURBINE"]).toBe(500);
  });

  it("keeps the current data when openAIP returns nothing usable", async () => {
    const { prisma, tx } = build();
    const client = { getObstacles: vi.fn().mockResolvedValue([]) };

    await expect(syncOpenAipObstacles(prisma as never, "key", client)).rejects.toThrow(/aucun obstacle/);
    expect(tx.obstacle.deleteMany).not.toHaveBeenCalled();
  });
});
