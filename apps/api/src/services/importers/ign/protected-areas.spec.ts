import { describe, it, expect, vi } from "vitest";
import {
  boundingBox,
  distanceToArea,
  simplifyGeometry,
  simplifyRing,
  type AreaGeometry,
  type Ring,
} from "./protected-areas.geometry";
import { kindOf, normalizeFeature, syncProtectedAreas } from "./protected-areas.importer";

/**
 * Protected areas are drawn around each aerodrome and listed with their
 * distance: the right zones must be kept, their shape must survive the
 * simplification, and the distance must be right.
 */

// ~1.1 km square around (3.0, 45.0)
const SQUARE: Ring = [[3, 45], [3.0141, 45], [3.0141, 45.01], [3, 45.01], [3, 45]];

describe("kindOf", () => {
  it.each([
    ["Parc national", "Zone cœur", "NATIONAL_PARK"],
    ["Parc national", null, "NATIONAL_PARK"],
    ["Parc national", "Aire d'adhésion", null],
    ["Réserve naturelle", "Réserve naturelle nationale", "NATURE_RESERVE"],
    ["Réserve naturelle", "Périmètre de protection d'une réserve naturelle nationale", null],
    ["Arrêté de protection", "Arrêté de protection de biotope", "BIOTOPE_PROTECTION"],
    ["Arrêté de protection", "Arrêté de protection de géotope", null],
    ["Site Natura 2000", "Site inscrit au titre de la Directive Oiseaux", "BIRD_SPA"],
    ["Site Natura 2000", "Site inscrit au titre de la Directive Habitats", null],
    ["Zone de silence", null, "SILENCE_ZONE"],
    ["Parc naturel régional", null, null],
  ])("%s / %s → %s", (nature, detail, expected) => {
    expect(kindOf(nature, detail)).toBe(expected);
  });
});

describe("simplification", () => {
  it("drops points closer to the line than the tolerance and keeps the corners", () => {
    const wobbly: Ring = [[3, 45], [3.005, 45.00001], [3.0141, 45], [3.0141, 45.01], [3, 45.01], [3, 45]];
    expect(simplifyRing(wobbly, 0.0003)).toEqual(SQUARE);
  });

  it("drops polygons that collapse and rounds coordinates", () => {
    // ~1 cm across: every point rounds to the same position.
    const tiny: Ring = [[3, 45], [3 + 1e-7, 45], [3 + 1e-7, 45 + 1e-7], [3, 45]];
    const multi: AreaGeometry = { type: "MultiPolygon", coordinates: [[tiny], [SQUARE.map(([x, y]) => [x + 1e-7, y] as [number, number])]] };
    expect(simplifyGeometry(multi, 0.0003)).toEqual({ type: "Polygon", coordinates: [SQUARE] });
  });

  it("handles rings of tens of thousands of points", () => {
    const circle: Ring = Array.from({ length: 40_000 }, (_, i) => {
      const a = (i / 39_999) * 2 * Math.PI;
      return [3 + 0.1 * Math.cos(a), 45 + 0.1 * Math.sin(a)];
    });
    const simplified = simplifyRing(circle, 0.0003);
    expect(simplified.length).toBeLessThan(400);
    expect(simplified.length).toBeGreaterThan(20);
  });
});

describe("distanceToArea", () => {
  const square: AreaGeometry = { type: "Polygon", coordinates: [SQUARE] };

  it("is 0 inside, and the distance to the nearest edge outside", () => {
    expect(distanceToArea(45.005, 3.007, square)).toBe(0);
    expect(distanceToArea(45.019, 3.007, square)).toBeCloseTo(1002, -1); // 0.009° north of the top edge
  });

  it("is not 0 inside a hole", () => {
    const hole: Ring = [[3.005, 45.003], [3.009, 45.003], [3.009, 45.007], [3.005, 45.007], [3.005, 45.003]];
    const withHole: AreaGeometry = { type: "Polygon", coordinates: [SQUARE, hole] };
    expect(distanceToArea(45.005, 3.007, withHole)).toBeGreaterThan(100);
  });

  it("gives the bounding box", () => {
    expect(boundingBox(square)).toEqual({ minLat: 45, maxLat: 45.01, minLon: 3, maxLon: 3.0141 });
  });
});

function feature(
  cleabs: string,
  nature = "Réserve naturelle",
  detail: string | null = "Réserve naturelle nationale",
  options: { name?: string; offset?: number; sources?: string; ids?: string } = {},
) {
  const dx = options.offset ?? 0;
  return {
    type: "Feature",
    properties: {
      cleabs, nature, nature_detaillee: detail, toponyme: options.name ?? " Réserve des Sept-Îles ",
      sources: options.sources ?? null, identifiants_sources: options.ids ?? null,
    },
    geometry: { type: "MultiPolygon", coordinates: [[SQUARE.map(([x, y]) => [x + dx, y, 0])]] },
  };
}

// Distinct zones: shift each one by 0.1° so they don't count as duplicates.
const distinct = (n: number) => Array.from({ length: n }, (_, i) => feature(`S${i}`, undefined, undefined, { offset: i * 0.1 }));

describe("normalizeFeature", () => {
  it("keeps the zone with its kind, name and bounding box", () => {
    expect(normalizeFeature(feature("SURF1"))).toMatchObject({
      source: "ign-bdtopo",
      sourceId: "SURF1",
      name: "Réserve des Sept-Îles",
      kind: "NATURE_RESERVE",
      geometry: { type: "Polygon", coordinates: [SQUARE] },
      minLat: 45,
      maxLon: 3.0141,
    });
  });

  it("drops zones we do not show and malformed features", () => {
    expect(normalizeFeature(feature("SURF2", "Parc naturel régional", null))).toBeNull();
    expect(normalizeFeature({ properties: { cleabs: "X" }, geometry: null })).toBeNull();
  });
});

describe("syncProtectedAreas", () => {
  function build() {
    const tx = {
      protectedArea: {
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)) };
    return { prisma, tx };
  }

  it("pages through the WFS and rebuilds the table", async () => {
    const { prisma, tx } = build();
    const all = distinct(650);
    const fetchPage = vi.fn(async (start: number) => ({ features: all.slice(start, start + 200) }));

    const result = await syncProtectedAreas(prisma as never, fetchPage);

    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 200, 400, 600]);
    expect(tx.protectedArea.deleteMany).toHaveBeenCalledWith({ where: { source: "ign-bdtopo" } });
    expect(tx.protectedArea.createMany).toHaveBeenCalledTimes(7);
    expect(result).toMatchObject({ fetched: 650, imported: 650, byKind: { NATURE_RESERVE: 650 } });
  });

  function inserted(tx: ReturnType<typeof build>["tx"]) {
    return tx.protectedArea.createMany.mock.calls.flatMap((c) => (c[0] as { data: { sourceId: string; name: string }[] }).data);
  }

  it("keeps one row per inventory id: the newer outline, the longer name", async () => {
    const { prisma, tx } = build();
    const all = [
      ...distinct(600),
      feature("D1", undefined, undefined, {
        name: "Réserve Naturelle Régionale du Val et Coteau", offset: 99, sources: "MNHN 2024/RNF", ids: "MNHN:FR9300025/RNF:RNR190",
      }),
      feature("D2", undefined, undefined, {
        name: "Val et Coteau", offset: 99.0001, sources: "MNHN 2026", ids: "MNHN:FR9300025",
      }),
    ];
    const fetchPage = vi.fn(async (start: number) => ({ features: all.slice(start, start + 200) }));

    const result = await syncProtectedAreas(prisma as never, fetchPage);

    expect(result.imported).toBe(601);
    expect(inserted(tx).find((r) => r.sourceId.startsWith("D"))).toMatchObject({
      sourceId: "D2",
      name: "Réserve Naturelle Régionale du Val et Coteau",
    });
  });

  it("falls back to the extent when there is no inventory id", async () => {
    const { prisma, tx } = build();
    const all = [
      ...distinct(600),
      feature("E1", undefined, undefined, { name: "Etang", offset: 99 }),
      feature("E2", undefined, undefined, { name: "Etang de la Ronce", offset: 99 }),
    ];
    const fetchPage = vi.fn(async (start: number) => ({ features: all.slice(start, start + 200) }));

    const result = await syncProtectedAreas(prisma as never, fetchPage);

    expect(result.imported).toBe(601);
    expect(inserted(tx).find((r) => r.sourceId.startsWith("E"))?.name).toBe("Etang de la Ronce");
  });

  it("keeps the current data when the answer is suspiciously small", async () => {
    const { prisma, tx } = build();
    const fetchPage = vi.fn(async () => ({ features: [feature("S1")] }));

    await expect(syncProtectedAreas(prisma as never, fetchPage)).rejects.toThrow(/données existantes conservées/);
    expect(tx.protectedArea.deleteMany).not.toHaveBeenCalled();
  });
});
