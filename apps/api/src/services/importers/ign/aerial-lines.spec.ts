import { describe, it, expect, vi } from "vitest";
import { normalizeAerialLine, syncAerialLines } from "./aerial-lines.importer";
import { nearestPointOnLine } from "./protected-areas.geometry";

/**
 * Overhead wires are shown to pilots around each aerodrome: only those that
 * are physically there and off the ground, with the right distance.
 */

function feature(props: Record<string, unknown>, coordinates: number[][] = [[2.1, 48.75, 120.4], [2.12, 48.76, 130]]) {
  return { type: "Feature", properties: { cleabs: "L1", ...props }, geometry: { type: "LineString", coordinates } };
}

describe("normalizeAerialLine", () => {
  it("keeps a power line with its voltage, without the altitude", () => {
    expect(normalizeAerialLine(feature({ voltage: "225 kV", etat_de_l_objet: "En service" }), "POWER_LINE")).toEqual({
      source: "ign-bdtopo",
      sourceId: "L1",
      kind: "POWER_LINE",
      detail: "225 kV",
      name: null,
      geometry: { type: "LineString", coordinates: [[2.1, 48.75], [2.12, 48.76]] },
      minLat: 48.75,
      maxLat: 48.76,
      minLon: 2.1,
      maxLon: 2.12,
    });
  });

  it("keeps lines that are physically there, not projects", () => {
    expect(normalizeAerialLine(feature({ voltage: "Inconnue", etat_de_l_objet: "Hors tension" }), "POWER_LINE")?.detail).toBeNull();
    expect(normalizeAerialLine(feature({ voltage: "63 kV", etat_de_l_objet: "En projet" }), "POWER_LINE")).toBeNull();
  });

  it("keeps aerial ropeways only", () => {
    const cable = (nature: string) => normalizeAerialLine(feature({ nature, toponyme: "Saulire", etat_de_l_objet: "En service" }), "CABLE");
    expect(cable("Télésiège")).toMatchObject({ kind: "CABLE", detail: "Télésiège", name: "Saulire" });
    expect(cable("Télécabine, téléphérique")).not.toBeNull();
    expect(cable("Téléski")).toBeNull();
    expect(cable("Tapis roulant de stations de montagne")).toBeNull();
  });

  it("drops malformed features", () => {
    expect(normalizeAerialLine(feature({}, [[2.1, 48.75]]), "POWER_LINE")).toBeNull();
    expect(normalizeAerialLine({ properties: { cleabs: "X" }, geometry: null }, "POWER_LINE")).toBeNull();
  });
});

describe("nearestPointOnLine", () => {
  it("finds the closest point of a segment, not just of its vertices", () => {
    // East-west line 2 km long, the aerodrome 1 km north of its middle.
    const line: [number, number][] = [[2.0, 45.0], [2.0254, 45.0]];
    const { distanceM, point } = nearestPointOnLine(45.009, 2.0127, line);
    expect(distanceM).toBeCloseTo(1002, -1);
    expect(point[0]).toBeCloseTo(2.0127, 4);
  });
});

describe("syncAerialLines", () => {
  function build() {
    const tx = { aerialLine: { deleteMany: vi.fn(), createMany: vi.fn() } };
    const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)) };
    return { prisma, tx };
  }
  const lines = (n: number, props: Record<string, unknown>) =>
    Array.from({ length: n }, (_, i) => ({ ...feature(props), properties: { cleabs: `C${i}`, ...props } }));

  it("pages through both layers and rebuilds the table", async () => {
    const { prisma, tx } = build();
    const power = lines(8500, { voltage: "63 kV", etat_de_l_objet: "En service" });
    const cables = lines(10, { nature: "Télésiège", etat_de_l_objet: "En service" });
    const powerPages = vi.fn(async (start: number) => ({ features: power.slice(start, start + 1000) }));

    const result = await syncAerialLines(prisma as never, [
      { kind: "POWER_LINE", fetch: powerPages },
      { kind: "CABLE", fetch: async () => ({ features: cables }) },
    ]);

    expect(powerPages).toHaveBeenCalledTimes(9);
    expect(tx.aerialLine.deleteMany).toHaveBeenCalledWith({ where: { source: "ign-bdtopo" } });
    expect(result).toEqual({ fetched: 8510, imported: 8510, byKind: { POWER_LINE: 8500, CABLE: 10 } });
  });

  it("keeps the current data when the answer looks truncated", async () => {
    const { prisma, tx } = build();
    await expect(
      syncAerialLines(prisma as never, [{ kind: "POWER_LINE", fetch: async () => ({ features: lines(50, { voltage: "63 kV" }) }) }]),
    ).rejects.toThrow(/données existantes conservées/);
    expect(tx.aerialLine.deleteMany).not.toHaveBeenCalled();
  });
});
