import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { reencodeForWeb, syncCommonsPhotos } from "./wikimedia.importer";
import type { WikimediaApi } from "./wikimedia.client";

/**
 * The import downloads only what changed on Commons, keeps the credit up to
 * date, and removes a photo whose licence no longer qualifies.
 */

const SHA1 = "e4cad16bf790aeb2bd23db8f8f8abe999c80fda6";

const sparql = {
  results: {
    bindings: [
      {
        item: { value: "http://www.wikidata.org/entity/Q100" },
        icao: { value: "LFPN" },
        image: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Toussus.jpg" },
      },
    ],
  },
};

function commonsResponse(license = "CC BY-SA 4.0") {
  return {
    query: {
      pages: [
        {
          title: "File:Toussus.jpg",
          imageinfo: [
            {
              thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Toussus.jpg/1280px-Toussus.jpg",
              url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Toussus.jpg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:Toussus.jpg",
              sha1: SHA1,
              mime: "image/jpeg",
              extmetadata: {
                LicenseShortName: { value: license },
                LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                Artist: { value: "Jean Dupont" },
                AttributionRequired: { value: "true" },
                Restrictions: { value: "" },
              },
            },
          ],
        },
      ],
    },
  };
}

async function png(width: number, height: number) {
  return sharp({ create: { width, height, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 0.5 } } })
    .png()
    .toBuffer();
}

async function build(aerodromes: Record<string, unknown>[], license?: string) {
  const image = await png(2000, 1000);
  const api: WikimediaApi = {
    sparql: vi.fn().mockResolvedValue(sparql),
    wikidata: vi.fn().mockResolvedValue({ entities: {} }),
    commons: vi.fn().mockResolvedValue(commonsResponse(license)),
    download: vi.fn().mockResolvedValue(image),
  };
  const store = {
    upload: vi.fn().mockResolvedValueOnce({ key: "commons/new.jpg" }).mockResolvedValueOnce({ key: "commons/new-thumb.jpg" }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    aerodrome: { findMany: vi.fn().mockResolvedValue(aerodromes) },
    commonsPhoto: {
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  return { api, store, prisma };
}

const toussus = { id: "a1", icaoCode: "LFPN", wikipediaUrl: null, commonsPhoto: null };
const stored = {
  id: "p1",
  fileTitle: "File:Toussus.jpg",
  sourceSha1: SHA1,
  storedKey: "commons/old.jpg",
  thumbKey: "commons/old-thumb.jpg",
  wikidataId: "Q100",
  pageUrl: "https://commons.wikimedia.org/wiki/File:Toussus.jpg",
  author: "Jean Dupont",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
};

describe("syncCommonsPhotos", () => {
  it("downloads, re-encodes and stores a new photo with its credit", async () => {
    const { api, store, prisma } = await build([toussus]);

    const result = await syncCommonsPhotos(prisma as never, api, store);

    expect(api.download).toHaveBeenCalledWith(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Toussus.jpg/1280px-Toussus.jpg",
    );
    expect(store.upload).toHaveBeenCalledTimes(2);
    expect(store.upload).toHaveBeenCalledWith(expect.any(Buffer), "jpg", "image/jpeg", "commons");
    const thumb = vi.mocked(store.upload).mock.calls[1]![0] as Buffer;
    expect((await sharp(thumb).metadata()).width).toBe(480);
    expect(prisma.commonsPhoto.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { aerodromeId: "a1" },
        create: expect.objectContaining({
          aerodromeId: "a1",
          wikidataId: "Q100",
          author: "Jean Dupont",
          license: "CC BY-SA 4.0",
          storedKey: "commons/new.jpg",
          thumbKey: "commons/new-thumb.jpg",
          width: 1280,
          height: 640,
        }),
      }),
    );
    expect(result).toMatchObject({ linkedByIcao: 1, accepted: 1, downloaded: 1, errors: [] });
  });

  it("does not download a file unchanged on Commons", async () => {
    const { api, store, prisma } = await build([{ ...toussus, commonsPhoto: stored }]);

    const result = await syncCommonsPhotos(prisma as never, api, store);

    expect(api.download).not.toHaveBeenCalled();
    expect(prisma.commonsPhoto.update).not.toHaveBeenCalled();
    expect(result.unchanged).toBe(1);
  });

  it("fetches a photo stored before thumbnails existed once more, and drops the old files", async () => {
    const { api, store, prisma } = await build([{ ...toussus, commonsPhoto: { ...stored, thumbKey: null } }]);

    const result = await syncCommonsPhotos(prisma as never, api, store);

    expect(api.download).toHaveBeenCalledTimes(1);
    expect(prisma.commonsPhoto.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ thumbKey: "commons/new-thumb.jpg" }) }),
    );
    expect(store.delete).toHaveBeenCalledWith("commons/old.jpg");
    expect(result.downloaded).toBe(1);
  });

  it("updates the credit alone when only the credit changed", async () => {
    const { api, store, prisma } = await build([{ ...toussus, commonsPhoto: { ...stored, author: "J. Dupont" } }]);

    await syncCommonsPhotos(prisma as never, api, store);

    expect(api.download).not.toHaveBeenCalled();
    expect(prisma.commonsPhoto.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({ author: "Jean Dupont" }),
    });
  });

  it("removes the photo and its file when the licence no longer qualifies", async () => {
    const { api, store, prisma } = await build([{ ...toussus, commonsPhoto: stored }], "GFDL");

    const result = await syncCommonsPhotos(prisma as never, api, store);

    expect(prisma.commonsPhoto.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(store.delete).toHaveBeenCalledWith("commons/old.jpg");
    expect(store.delete).toHaveBeenCalledWith("commons/old-thumb.jpg");
    expect(result.rejected).toEqual({ "licence non retenue (GFDL)": 1 });
  });

  it("links by Wikipedia article when the aerodrome has no ICAO image", async () => {
    const { api, store, prisma } = await build([
      { id: "a2", icaoCode: null, wikipediaUrl: "https://fr.wikipedia.org/wiki/A%C3%A9rodrome_X", commonsPhoto: null },
    ]);
    vi.mocked(api.wikidata).mockResolvedValue({
      entities: {
        Q100: {
          id: "Q100",
          sitelinks: { frwiki: { title: "Aérodrome X" } },
          claims: { P18: [{ rank: "normal", mainsnak: { datavalue: { value: "Toussus.jpg" } } }] },
        },
      },
    });

    const result = await syncCommonsPhotos(prisma as never, api, store, { dryRun: true });

    expect(api.wikidata).toHaveBeenCalledWith(expect.objectContaining({ sites: "frwiki", titles: "Aérodrome X" }));
    expect(result).toMatchObject({ linkedByWikipedia: 1, accepted: 1, downloaded: 1 });
    // Dry run: nothing fetched or written.
    expect(api.download).not.toHaveBeenCalled();
    expect(prisma.commonsPhoto.upsert).not.toHaveBeenCalled();
  });

  it("keeps going when one file fails", async () => {
    const { api, store, prisma } = await build([toussus]);
    vi.mocked(api.download).mockRejectedValue(new Error("HTTP 503"));

    const result = await syncCommonsPhotos(prisma as never, api, store);

    expect(result.errors).toEqual(["LFPN: HTTP 503"]);
  });
});

describe("reencodeForWeb", () => {
  it("caps the width, keeps the ratio and outputs JPEG", async () => {
    const out = await reencodeForWeb(await png(3000, 2000));
    expect(out).toMatchObject({ width: 1280, height: 853 });
    expect((await sharp(out.buffer).metadata()).format).toBe("jpeg");
  });

  it("does not enlarge small images", async () => {
    expect(await reencodeForWeb(await png(800, 600))).toMatchObject({ width: 800, height: 600 });
  });
});
