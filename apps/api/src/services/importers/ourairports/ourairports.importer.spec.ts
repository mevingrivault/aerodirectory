import { describe, it, expect, vi } from "vitest";
import { syncOurAirportsLinks } from "./ourairports.importer";

/**
 * The import writes only the two link columns, only on imported aerodromes,
 * and only when they changed.
 */

const CSV = [
  "id,ident,type,name,latitude_deg,longitude_deg,iso_country,icao_code,gps_code,home_link,wikipedia_link",
  `1,LFPN,small_airport,Toussus,48.7519,2.1061,FR,LFPN,LFPN,https://www.toussus.fr/,https://fr.wikipedia.org/wiki/Toussus`,
  `2,LFPG,large_airport,CDG,49.0,2.55,FR,LFPG,LFPG,http://www.aeroportsdeparis.fr/,`,
].join("\n");

function build(aerodromes: Record<string, unknown>[]) {
  const prisma = {
    aerodrome: {
      findMany: vi.fn().mockResolvedValue(aerodromes),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return prisma;
}

describe("syncOurAirportsLinks", () => {
  const toussus = { id: "a1", icaoCode: "LFPN", latitude: 48.7519, longitude: 2.1061, websiteUrl: null, wikipediaUrl: null };
  const cdg = {
    id: "a2", icaoCode: "LFPG", latitude: 49.0, longitude: 2.55,
    websiteUrl: "http://www.aeroportsdeparis.fr/", wikipediaUrl: null,
  };

  it("loads imported aerodromes only, never manual sheets", async () => {
    const prisma = build([]);
    await syncOurAirportsLinks(prisma as never, CSV);

    expect(prisma.aerodrome.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { source: { not: null }, NOT: { source: "manual" } } }),
    );
  });

  it("writes the links that changed and nothing else", async () => {
    const prisma = build([toussus, cdg]);
    const result = await syncOurAirportsLinks(prisma as never, CSV);

    expect(prisma.aerodrome.update).toHaveBeenCalledTimes(1);
    expect(prisma.aerodrome.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { websiteUrl: "https://www.toussus.fr/", wikipediaUrl: "https://fr.wikipedia.org/wiki/Toussus" },
    });
    expect(result).toMatchObject({ matchedByCode: 2, withWebsite: 2, withWikipedia: 1, updated: 1 });
  });

  it("writes nothing in dry-run mode", async () => {
    const prisma = build([toussus]);
    const result = await syncOurAirportsLinks(prisma as never, CSV, { dryRun: true });

    expect(prisma.aerodrome.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ updated: 1, dryRun: true });
  });
});
