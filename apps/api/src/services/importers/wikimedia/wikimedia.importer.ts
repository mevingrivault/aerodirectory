/**
 * Commons photos importer — gives each aerodrome the main image of its
 * Wikidata item, copied into our storage with its credit.
 *
 * Aerodromes are linked to Wikidata by ICAO code (P239), then by their
 * Wikipedia article for those without one. Idempotent: a file unchanged on
 * Commons (same sha1) is not downloaded again, and a photo whose image or
 * licence no longer qualifies is removed.
 */

import sharp from "sharp";
import type { PrismaClient } from "@aerodirectory/database";
import type { WikimediaApi } from "./wikimedia.client";
import {
  icaoImagesQuery,
  parseIcaoImages,
  parseImageInfo,
  parseSitelinkImages,
  sitelinkFromWikipediaUrl,
  type CommonsImage,
  type ImageRef,
  type ImageVerdict,
} from "./wikimedia.normalizer";

export interface PhotoStore {
  upload(buffer: Buffer, ext: string, mimeType: string, folder?: string): Promise<{ key: string }>;
  delete(key: string): Promise<void>;
}

export interface CommonsImportResult {
  aerodromes: number;
  linkedByIcao: number;
  linkedByWikipedia: number;
  accepted: number;
  rejected: Record<string, number>;
  downloaded: number;
  metadataUpdated: number;
  unchanged: number;
  removed: number;
  errors: string[];
  dryRun: boolean;
}

const API_BATCH = 50; // titles/ids per action API request
const STORAGE_FOLDER = "commons";
const MAX_WIDTH = 1280;
const THUMB_WIDTH = 480; // result lists show it at 96 px wide, 2× for dense screens and margin
const MAX_INPUT_PIXELS = 50_000_000;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** JPEG copy, at most `maxWidth` px wide, without the source metadata. */
export async function reencodeForWeb(
  buffer: Buffer,
  maxWidth = MAX_WIDTH,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

export async function syncCommonsPhotos(
  prisma: PrismaClient,
  api: WikimediaApi,
  store: PhotoStore,
  options: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<CommonsImportResult> {
  const dryRun = options.dryRun ?? false;
  const log = options.log ?? (() => undefined);

  const aerodromes = await prisma.aerodrome.findMany({
    select: {
      id: true,
      icaoCode: true,
      wikipediaUrl: true,
      commonsPhoto: {
        select: { id: true, fileTitle: true, sourceSha1: true, storedKey: true, thumbKey: true, author: true, license: true, licenseUrl: true, pageUrl: true, wikidataId: true },
      },
    },
  });

  const result: CommonsImportResult = {
    aerodromes: aerodromes.length,
    linkedByIcao: 0,
    linkedByWikipedia: 0,
    accepted: 0,
    rejected: {},
    downloaded: 0,
    metadataUpdated: 0,
    unchanged: 0,
    removed: 0,
    errors: [],
    dryRun,
  };

  // 1. Aerodrome → Wikidata image, by ICAO code
  log("Wikidata: images by ICAO code...");
  const byIcao = parseIcaoImages(await api.sparql(icaoImagesQuery()));
  const refs = new Map<string, ImageRef>();
  for (const a of aerodromes) {
    const ref = a.icaoCode ? byIcao.get(a.icaoCode) : undefined;
    if (ref) {
      refs.set(a.id, ref);
      result.linkedByIcao++;
    }
  }

  // 2. …then by Wikipedia article, for the others
  const bySite = new Map<string, { aerodromeId: string; title: string }[]>();
  for (const a of aerodromes) {
    if (refs.has(a.id) || !a.wikipediaUrl) continue;
    const link = sitelinkFromWikipediaUrl(a.wikipediaUrl);
    if (!link) continue;
    bySite.set(link.site, [...(bySite.get(link.site) ?? []), { aerodromeId: a.id, title: link.title }]);
  }
  for (const [site, articles] of bySite) {
    log(`Wikidata: images by ${site} article (${articles.length})...`);
    for (const batch of chunks(articles, API_BATCH)) {
      const images = parseSitelinkImages(
        await api.wikidata({
          action: "wbgetentities",
          sites: site,
          titles: batch.map((b) => b.title).join("|"),
          props: "claims|sitelinks",
          sitefilter: site,
        }),
        site,
      );
      for (const { aerodromeId, title } of batch) {
        const ref = images.get(title);
        if (ref) {
          refs.set(aerodromeId, ref);
          result.linkedByWikipedia++;
        }
      }
    }
  }

  // 3. Licence and file details from Commons
  const titles = [...new Set([...refs.values()].map((r) => r.fileTitle))];
  log(`Commons: details of ${titles.length} files...`);
  const verdicts = new Map<string, ImageVerdict>();
  for (const batch of chunks(titles, API_BATCH)) {
    const parsed = parseImageInfo(
      await api.commons({
        action: "query",
        prop: "imageinfo",
        titles: batch.join("|"),
        iiprop: "url|extmetadata|sha1|mime",
        iiurlwidth: String(MAX_WIDTH),
        iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|AttributionRequired|Restrictions|NonFree",
      }),
    );
    for (const [title, verdict] of parsed) verdicts.set(title, verdict);
  }

  // 4. Store, refresh or remove each aerodrome's photo
  for (const a of aerodromes) {
    const ref = refs.get(a.id);
    const verdict = ref ? verdicts.get(ref.fileTitle) : undefined;
    const existing = a.commonsPhoto;

    if (ref && verdict && !verdict.ok) {
      result.rejected[verdict.reason] = (result.rejected[verdict.reason] ?? 0) + 1;
    }

    try {
      if (!ref || !verdict?.ok) {
        if (existing) {
          result.removed++;
          if (!dryRun) {
            await prisma.commonsPhoto.delete({ where: { id: existing.id } });
            await store.delete(existing.storedKey);
            if (existing.thumbKey) await store.delete(existing.thumbKey);
          }
        }
        continue;
      }

      result.accepted++;
      const image: CommonsImage = verdict.image;
      const credit = {
        wikidataId: ref.wikidataId,
        pageUrl: image.pageUrl,
        author: image.author,
        license: image.license,
        licenseUrl: image.licenseUrl,
      };

      // Photos stored before thumbnails existed are fetched again once to get one.
      if (existing && existing.fileTitle === image.fileTitle && existing.sourceSha1 === image.sha1 && existing.thumbKey) {
        const same = (Object.keys(credit) as (keyof typeof credit)[]).every((k) => existing[k] === credit[k]);
        if (same) {
          result.unchanged++;
        } else {
          result.metadataUpdated++;
          if (!dryRun) await prisma.commonsPhoto.update({ where: { id: existing.id }, data: credit });
        }
        continue;
      }

      result.downloaded++;
      if (dryRun) continue;

      const source = await api.download(image.thumbUrl);
      const copy = await reencodeForWeb(source);
      const thumb = await reencodeForWeb(source, THUMB_WIDTH);
      const { key } = await store.upload(copy.buffer, "jpg", "image/jpeg", STORAGE_FOLDER);
      const { key: thumbKey } = await store.upload(thumb.buffer, "jpg", "image/jpeg", STORAGE_FOLDER);
      const data = {
        ...credit,
        fileTitle: image.fileTitle,
        sourceSha1: image.sha1,
        storedKey: key,
        thumbKey,
        mimeType: "image/jpeg",
        width: copy.width,
        height: copy.height,
      };
      await prisma.commonsPhoto.upsert({
        where: { aerodromeId: a.id },
        create: { aerodromeId: a.id, ...data },
        update: data,
      });
      if (existing) {
        await store.delete(existing.storedKey);
        if (existing.thumbKey) await store.delete(existing.thumbKey);
      }
    } catch (error) {
      const msg = `${a.icaoCode ?? a.id}: ${(error as Error).message}`;
      log(`  ERROR ${msg}`);
      result.errors.push(msg);
    }
  }

  return result;
}
