import { describe, it, expect } from "vitest";
import {
  linksFor,
  matchAerodromes,
  parseCsv,
  safeUrl,
  sharedLinks,
  toOurAirportsRows,
  type AerodromeRef,
  type OurAirportsRow,
} from "./ourairports.normalizer";

/**
 * OurAirports links end up in an <a href> on the aerodrome sheet, and a
 * wrong match would show another strip's website: both are checked here.
 */

const HEADER =
  "id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords";

function row(overrides: Partial<OurAirportsRow>): OurAirportsRow {
  return {
    ident: "FR-0001",
    type: "small_airport",
    name: "Terrain",
    latitude: 45,
    longitude: 3,
    isoCountry: "FR",
    icaoCode: null,
    gpsCode: null,
    homeLink: null,
    wikipediaLink: null,
    ...overrides,
  };
}

describe("parseCsv", () => {
  it("handles quoted fields, doubled quotes and newlines inside quotes", () => {
    const csv = `${HEADER}\n4185,"LFPG","large_airport","Charles ""CDG"" de Gaulle",49.0,2.5,392,"EU","FR","FR-IDF","Paris","yes","LFPG","CDG","LFPG",,"http://www.aeroportsdeparis.fr/","https://en.wikipedia.org/wiki/Charles_de_Gaulle_Airport","PAR,\nRoissy"\r\n`;
    const [record] = parseCsv(csv);
    expect(record!["name"]).toBe('Charles "CDG" de Gaulle');
    expect(record!["keywords"]).toBe("PAR,\nRoissy");
    expect(record!["local_code"]).toBe("");
  });

  it("keeps French rows and drops closed aerodromes", () => {
    const csv = [
      HEADER,
      `1,LFPN,small_airport,Toussus,48.75,2.11,,EU,FR,FR-IDF,,no,LFPN,TNF,LFPN,,,,`,
      `2,LF9999,closed,Ancien terrain,48.7,2.1,,EU,FR,FR-IDF,,no,,,,,,,`,
      `3,EGLL,large_airport,Heathrow,51.47,-0.45,,EU,GB,GB-ENG,,yes,EGLL,LHR,EGLL,,,,`,
      `4,TFFR,medium_airport,Pointe-à-Pitre,16.26,-61.53,,NA,GP,GP-U-A,,yes,TFFR,PTP,TFFR,,,,`,
    ].join("\n");
    expect(toOurAirportsRows(parseCsv(csv)).map((r) => r.ident)).toEqual(["LFPN", "TFFR"]);
  });
});

describe("safeUrl", () => {
  it("accepts http(s) links only", () => {
    expect(safeUrl("http://www.aeroclub.fr")).toBe("http://www.aeroclub.fr/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("ftp://example.org/file")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl("https://user:pass@example.org")).toBeNull();
    expect(safeUrl(`https://example.org/${"a".repeat(600)}`)).toBeNull();
  });

  it("accepts Wikipedia articles only for the Wikipedia link, over https", () => {
    const linkOf = (wikipediaLink: string) => linksFor(row({ wikipediaLink }), new Set()).wikipediaUrl;
    expect(linkOf("http://fr.wikipedia.org/wiki/A%C3%A9rodrome_de_Toussus-le-Noble")).toBe(
      "https://fr.wikipedia.org/wiki/A%C3%A9rodrome_de_Toussus-le-Noble",
    );
    expect(linkOf("https://wikipedia.org.evil.example/wiki/X")).toBeNull();
    expect(linkOf("https://www.aeroclub.fr")).toBeNull();
  });
});

describe("linksFor", () => {
  it("drops a website shared by several aerodromes", () => {
    const rows = [1, 2, 3].map((i) =>
      row({ ident: `FR-000${i}`, homeLink: "https://www.afpm.fr/Terrains/Terrains_Montagne.php" }),
    );
    const own = row({ homeLink: "https://www.aeroclub-de-valloire.com/" });
    const shared = sharedLinks([...rows, own]);

    expect(linksFor(rows[0]!, shared).websiteUrl).toBeNull();
    expect(linksFor(own, shared).websiteUrl).toBe("https://www.aeroclub-de-valloire.com/");
  });
});

describe("matchAerodromes", () => {
  const toussus: AerodromeRef = { id: "a-toussus", icaoCode: "LFPN", latitude: 48.7519, longitude: 2.1061 };

  it("matches on ICAO, GPS code or ident", () => {
    const byGps = row({ ident: "FR-0042", gpsCode: "LFPN", latitude: 0, longitude: 0 });
    const matches = matchAerodromes([byGps], [toussus]);
    expect(matches.get("a-toussus")).toEqual({ row: byGps, method: "code" });
  });

  it("matches an aerodrome without ICAO code by position, within 1 km", () => {
    const strip: AerodromeRef = { id: "a-strip", icaoCode: null, latitude: 45.0, longitude: 3.0 };
    const near = row({ latitude: 45.004, longitude: 3.0 }); // ~450 m
    const far = row({ ident: "FR-0002", latitude: 45.02, longitude: 3.0 }); // ~2.2 km

    expect(matchAerodromes([near], [strip]).get("a-strip")?.method).toBe("distance");
    expect(matchAerodromes([far], [strip]).size).toBe(0);
  });

  it("does not hand a strip the links of a closer neighbour", () => {
    // Two strips 600 m apart, one OurAirports row right on the second one.
    const a: AerodromeRef = { id: "a", icaoCode: null, latitude: 45.0, longitude: 3.0 };
    const b: AerodromeRef = { id: "b", icaoCode: null, latitude: 45.0054, longitude: 3.0 };
    const onB = row({ latitude: 45.0055, longitude: 3.0 });

    const matches = matchAerodromes([onB], [a, b]);
    expect(matches.get("b")?.row).toBe(onB);
    expect(matches.has("a")).toBe(false);
  });

  it("does not match by position a row already matched by code", () => {
    const strip: AerodromeRef = { id: "a-strip", icaoCode: null, latitude: 48.752, longitude: 2.106 };
    const lfpn = row({ ident: "LFPN", icaoCode: "LFPN", latitude: 48.752, longitude: 2.106 });

    const matches = matchAerodromes([lfpn], [toussus, strip]);
    expect(matches.get("a-toussus")?.method).toBe("code");
    expect(matches.has("a-strip")).toBe(false);
  });
});
