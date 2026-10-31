/**
 * Wikidata → Wikimedia Commons: finds the main image (P18) of each
 * aerodrome and decides whether its licence lets us show it.
 *
 * Accepted: public domain, CC0, CC BY, CC BY-SA and Licence Ouverte. We only resize and
 * re-encode the file, which the CC licences treat as a technical change,
 * not an adaptation; the credit (author, licence, link) is shown with it.
 */

import { z } from "zod";

// ICAO prefixes of France and its overseas territories.
export const FRENCH_ICAO_PREFIXES = ["LF", "TF", "FM", "SO", "NW", "NT", "NL"];

export interface ImageRef {
  wikidataId: string;
  fileTitle: string; // "File:…"
}

export interface CommonsImage {
  fileTitle: string;
  pageUrl: string;
  thumbUrl: string;
  sha1: string;
  mimeType: string;
  author: string | null;
  license: string;
  licenseUrl: string | null;
}

export type ImageVerdict =
  | { ok: true; image: CommonsImage }
  | { ok: false; reason: string };

const MAX_AUTHOR_LENGTH = 200;

// ─── SPARQL: ICAO code → image ─────────────────────────────────────────────

export function icaoImagesQuery(): string {
  const prefixes = FRENCH_ICAO_PREFIXES.map((p) => `STRSTARTS(?icao, "${p}")`).join(" || ");
  return `SELECT ?item ?icao ?image WHERE { ?item wdt:P239 ?icao ; wdt:P18 ?image . FILTER(${prefixes}) }`;
}

const SparqlSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        item: z.object({ value: z.string() }),
        icao: z.object({ value: z.string() }),
        image: z.object({ value: z.string() }),
      }),
    ),
  }),
});

/** "http://commons.wikimedia.org/wiki/Special:FilePath/A%20b.jpg" → "File:A b.jpg" */
export function fileTitleFromFilePath(url: string): string | null {
  const name = url.split("/Special:FilePath/")[1];
  if (!name) return null;
  try {
    return `File:${decodeURIComponent(name).replace(/_/g, " ")}`;
  } catch {
    return null;
  }
}

/** ICAO code → first image found for it. */
export function parseIcaoImages(json: unknown): Map<string, ImageRef> {
  const images = new Map<string, ImageRef>();
  for (const b of SparqlSchema.parse(json).results.bindings) {
    const icao = b.icao.value.trim().toUpperCase();
    const fileTitle = fileTitleFromFilePath(b.image.value);
    const wikidataId = b.item.value.split("/").pop() ?? "";
    if (!fileTitle || !/^Q\d+$/.test(wikidataId) || images.has(icao)) continue;
    images.set(icao, { wikidataId, fileTitle });
  }
  return images;
}

// ─── Wikipedia article → Wikidata item → image ─────────────────────────────

/** "https://fr.wikipedia.org/wiki/A%C3%A9rodrome_X" → { site: "frwiki", title: "Aérodrome X" } */
export function sitelinkFromWikipediaUrl(url: string): { site: string; title: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const lang = parsed.hostname.match(/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/)?.[1];
  const path = parsed.pathname.match(/^\/wiki\/(.+)$/)?.[1];
  if (!lang || !path) return null;
  try {
    return { site: `${lang.replace(/-/g, "_")}wiki`, title: decodeURIComponent(path).replace(/_/g, " ") };
  } catch {
    return null;
  }
}

const SnakSchema = z.object({
  rank: z.string(),
  mainsnak: z.object({
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});

const EntitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      id: z.string().optional(),
      missing: z.string().optional(),
      claims: z.record(z.string(), z.array(SnakSchema)).optional(),
      sitelinks: z.record(z.string(), z.object({ title: z.string() })).optional(),
    }),
  ),
});

/** Preferred image first, then normal ones; deprecated statements are ignored. */
function mainImage(claims: z.infer<typeof SnakSchema>[] | undefined): string | null {
  const ranked = (claims ?? [])
    .filter((c) => c.rank !== "deprecated" && typeof c.mainsnak.datavalue?.value === "string")
    .sort((a, b) => Number(b.rank === "preferred") - Number(a.rank === "preferred"));
  const name = ranked[0]?.mainsnak.datavalue?.value as string | undefined;
  return name ? `File:${name}` : null;
}

/** wbgetentities response → article title (on `site`) → image. */
export function parseSitelinkImages(json: unknown, site: string): Map<string, ImageRef> {
  const images = new Map<string, ImageRef>();
  for (const entity of Object.values(EntitiesSchema.parse(json).entities)) {
    if (entity.missing !== undefined || !entity.id) continue;
    const title = entity.sitelinks?.[site]?.title;
    const fileTitle = mainImage(entity.claims?.["P18"]);
    if (title && fileTitle) images.set(title, { wikidataId: entity.id, fileTitle });
  }
  return images;
}

// ─── Commons imageinfo ─────────────────────────────────────────────────────

const MetaValue = z.object({ value: z.unknown() }).optional();

const ImageInfoSchema = z.object({
  query: z.object({
    normalized: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
    pages: z.array(
      z.object({
        title: z.string(),
        missing: z.boolean().optional(),
        imageinfo: z
          .array(
            z.object({
              thumburl: z.string().optional(),
              url: z.string(),
              descriptionurl: z.string(),
              sha1: z.string(),
              mime: z.string(),
              extmetadata: z.record(z.string(), MetaValue).optional(),
            }),
          )
          .optional(),
      }),
    ),
  }),
});

// Licence Ouverte (Etalab) is an attribution licence, compatible with CC BY.
const ACCEPTED_LICENSE = /^(?:CC0(?:\b|$)|Public domain$|PD(?:\b|-)|CC BY(?:-SA)? \d(?:\.\d)?(?:[\s,]|$)|Licence Ouverte(?:\b|$))/i;
const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

/** Plain text from the HTML Commons puts in Artist. */
export function plainText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > MAX_AUTHOR_LENGTH ? `${text.slice(0, MAX_AUTHOR_LENGTH - 1)}…` : text;
}

function metaString(meta: Record<string, { value?: unknown } | undefined> | undefined, key: string): string {
  const value = meta?.[key]?.value;
  return typeof value === "string" ? value.trim() : "";
}

/** Our verdict on each file of an imageinfo response, keyed by the title we asked for. */
export function parseImageInfo(json: unknown): Map<string, ImageVerdict> {
  const { query } = ImageInfoSchema.parse(json);
  const askedFor = new Map((query.normalized ?? []).map((n) => [n.to, n.from]));
  const verdicts = new Map<string, ImageVerdict>();

  for (const page of query.pages) {
    const key = askedFor.get(page.title) ?? page.title;
    const info = page.imageinfo?.[0];
    if (page.missing || !info) {
      verdicts.set(key, { ok: false, reason: "fichier introuvable" });
      continue;
    }
    verdicts.set(key, judge(page.title, info));
  }
  return verdicts;
}

function judge(
  fileTitle: string,
  info: NonNullable<z.infer<typeof ImageInfoSchema>["query"]["pages"][number]["imageinfo"]>[number],
): ImageVerdict {
  const meta = info.extmetadata as Record<string, { value?: unknown } | undefined> | undefined;
  const license = metaString(meta, "LicenseShortName");

  if (!ACCEPTED_LICENSE.test(license)) return { ok: false, reason: `licence non retenue (${license || "aucune"})` };
  if (metaString(meta, "NonFree").toLowerCase() === "true") return { ok: false, reason: "fichier non libre" };
  // Personality rights, trademarks, insignia…: not for us to judge.
  if (metaString(meta, "Restrictions")) return { ok: false, reason: `restriction (${metaString(meta, "Restrictions")})` };
  if (!ACCEPTED_MIME.has(info.mime)) return { ok: false, reason: `format non retenu (${info.mime})` };

  const author = plainText(metaString(meta, "Artist"));
  const attributionRequired = metaString(meta, "AttributionRequired").toLowerCase() !== "false";
  if (!author && attributionRequired) return { ok: false, reason: "auteur inconnu" };

  const thumbUrl = info.thumburl ?? info.url;
  if (!isUploadUrl(thumbUrl) || !isCommonsPage(info.descriptionurl)) {
    return { ok: false, reason: "URL inattendue" };
  }

  const licenseUrl = metaString(meta, "LicenseUrl");
  return {
    ok: true,
    image: {
      fileTitle,
      pageUrl: info.descriptionurl,
      thumbUrl,
      sha1: info.sha1,
      mimeType: info.mime,
      author,
      license,
      licenseUrl: licenseUrl && /^https?:\/\//.test(licenseUrl) ? licenseUrl.replace(/^http:/, "https:") : null,
    },
  };
}

// Originals come from upload.wikimedia.org, scaled thumbnails from thumb.wikimedia.org.
const MEDIA_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);

/** We only ever download from Wikimedia's media servers. */
export function isUploadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && MEDIA_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function isCommonsPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "commons.wikimedia.org";
  } catch {
    return false;
  }
}
