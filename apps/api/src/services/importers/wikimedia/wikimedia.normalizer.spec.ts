import { describe, it, expect } from "vitest";
import {
  fileTitleFromFilePath,
  icaoImagesQuery,
  isUploadUrl,
  parseIcaoImages,
  parseImageInfo,
  parseSitelinkImages,
  plainText,
  sitelinkFromWikipediaUrl,
} from "./wikimedia.normalizer";

/**
 * Which Commons files we are allowed to show, and with what credit.
 * Fixtures follow real Wikidata / Commons responses.
 */

function imagePage(title: string, meta: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return {
    title,
    imageinfo: [
      {
        thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/X.jpg/1280px-X.jpg",
        url: "https://upload.wikimedia.org/wikipedia/commons/1/1e/X.jpg",
        descriptionurl: `https://commons.wikimedia.org/wiki/${title.replace(/ /g, "_")}`,
        sha1: "e4cad16bf790aeb2bd23db8f8f8abe999c80fda6",
        mime: "image/jpeg",
        extmetadata: Object.fromEntries(Object.entries(meta).map(([k, value]) => [k, { value, source: "commons-desc-page" }])),
        ...overrides,
      },
    ],
  };
}

const CC_BY_SA = {
  LicenseShortName: "CC BY-SA 4.0",
  LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  Artist: '<a href="//commons.wikimedia.org/wiki/User:Ji-Elle" title="User:Ji-Elle">Ji-Elle</a>',
  AttributionRequired: "true",
  Restrictions: "",
};

function verdictOf(meta: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const json = { query: { pages: [imagePage("File:X.jpg", meta, overrides)] } };
  return parseImageInfo(json).get("File:X.jpg")!;
}

describe("licences", () => {
  it.each([
    "CC BY-SA 4.0",
    "CC BY-SA 3.0",
    "CC BY-SA 2.5,2.0,1.0",
    "CC BY-SA 3.0 de",
    "CC BY 2.0",
    "CC0",
    "Public domain",
    "Licence Ouverte",
  ])("accepts %s", (license) => {
    expect(verdictOf({ ...CC_BY_SA, LicenseShortName: license }).ok).toBe(true);
  });

  it.each(["GFDL 1.2", "GPL", "FAL", "Attribution", "CC BY-NC 2.0", "Copyrighted free use", ""])("rejects %s", (license) => {
    expect(verdictOf({ ...CC_BY_SA, LicenseShortName: license }).ok).toBe(false);
  });

  it("rejects files with restrictions such as personality rights", () => {
    expect(verdictOf({ ...CC_BY_SA, Restrictions: "personality" })).toEqual({
      ok: false,
      reason: "restriction (personality)",
    });
  });

  it("rejects non-free files and formats we cannot show", () => {
    expect(verdictOf({ ...CC_BY_SA, NonFree: "true" }).ok).toBe(false);
    expect(verdictOf(CC_BY_SA, { mime: "image/svg+xml" }).ok).toBe(false);
  });

  it("requires an author when attribution is required, not for the public domain", () => {
    expect(verdictOf({ ...CC_BY_SA, Artist: "" })).toEqual({ ok: false, reason: "auteur inconnu" });
    const pd = verdictOf({ LicenseShortName: "Public domain", AttributionRequired: "false", Artist: "" });
    expect(pd.ok && pd.image.author).toBeNull();
  });

  it("refuses to download from anywhere but Wikimedia's media servers", () => {
    expect(verdictOf(CC_BY_SA, { thumburl: "https://evil.example/x.jpg" })).toEqual({ ok: false, reason: "URL inattendue" });
    expect(isUploadUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/X.jpg/1280px-X.jpg")).toBe(true);
    expect(isUploadUrl("http://upload.wikimedia.org/x.jpg")).toBe(false);
    expect(isUploadUrl("https://upload.wikimedia.org.evil.example/x.jpg")).toBe(false);
  });
});

describe("credit", () => {
  it("keeps the author as plain text and the licence link", () => {
    const verdict = verdictOf(CC_BY_SA);
    expect(verdict).toEqual({
      ok: true,
      image: expect.objectContaining({
        fileTitle: "File:X.jpg",
        pageUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
        author: "Ji-Elle",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      }),
    });
  });

  it("strips tags and decodes entities", () => {
    expect(plainText('<a href="x">Markus3</a> (Marc ROUSSEL) &amp; <b>Ann&#233;e</b>')).toBe("Markus3 (Marc ROUSSEL) & Année");
    expect(plainText("<script>x</script>")).toBe("x");
    expect(plainText("")).toBeNull();
    expect(plainText("a".repeat(300))!.length).toBe(200);
  });

  it("maps verdicts back to the title we asked for after normalisation", () => {
    const json = {
      query: {
        normalized: [{ from: "File:Tour_Châteauroux.JPG", to: "File:Tour Châteauroux.JPG" }],
        pages: [imagePage("File:Tour Châteauroux.JPG", CC_BY_SA), { title: "File:Missing.jpg", missing: true }],
      },
    };
    const verdicts = parseImageInfo(json);
    expect(verdicts.get("File:Tour_Châteauroux.JPG")?.ok).toBe(true);
    expect(verdicts.get("File:Missing.jpg")).toEqual({ ok: false, reason: "fichier introuvable" });
  });
});

describe("Wikidata", () => {
  it("queries the French ICAO prefixes", () => {
    expect(icaoImagesQuery()).toContain('STRSTARTS(?icao, "LF")');
    expect(icaoImagesQuery()).toContain('STRSTARTS(?icao, "TF")');
  });

  it("reads ICAO → image from the SPARQL results", () => {
    const images = parseIcaoImages({
      results: {
        bindings: [
          {
            item: { type: "uri", value: "http://www.wikidata.org/entity/Q2886463" },
            icao: { type: "literal", value: "LFMO" },
            image: { type: "uri", value: "http://commons.wikimedia.org/wiki/Special:FilePath/Orange-Caritat%20Air%20Base.jpg" },
          },
          {
            item: { type: "uri", value: "http://www.wikidata.org/entity/Q2886463" },
            icao: { type: "literal", value: "LFMO" },
            image: { type: "uri", value: "http://commons.wikimedia.org/wiki/Special:FilePath/Second.jpg" },
          },
        ],
      },
    });
    expect(images.get("LFMO")).toEqual({ wikidataId: "Q2886463", fileTitle: "File:Orange-Caritat Air Base.jpg" });
  });

  it("takes the preferred P18 of an item found by its Wikipedia article", () => {
    const images = parseSitelinkImages(
      {
        entities: {
          Q1: {
            id: "Q1",
            sitelinks: { frwiki: { title: "Aérodrome de Toussus-le-Noble" } },
            claims: {
              P18: [
                { rank: "normal", mainsnak: { datavalue: { value: "Normal.jpg" } } },
                { rank: "preferred", mainsnak: { datavalue: { value: "Preferred.jpg" } } },
                { rank: "deprecated", mainsnak: { datavalue: { value: "Old.jpg" } } },
              ],
            },
          },
          "-1": { missing: "" },
        },
      },
      "frwiki",
    );
    expect(images.get("Aérodrome de Toussus-le-Noble")).toEqual({ wikidataId: "Q1", fileTitle: "File:Preferred.jpg" });
  });

  it("turns Wikipedia URLs and FilePath URLs into titles", () => {
    expect(sitelinkFromWikipediaUrl("https://fr.wikipedia.org/wiki/A%C3%A9rodrome_de_Toussus-le-Noble")).toEqual({
      site: "frwiki",
      title: "Aérodrome de Toussus-le-Noble",
    });
    expect(sitelinkFromWikipediaUrl("https://example.org/wiki/X")).toBeNull();
    expect(fileTitleFromFilePath("http://commons.wikimedia.org/wiki/Special:FilePath/A_b%20c.jpg")).toBe("File:A b c.jpg");
  });
});
