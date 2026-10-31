/**
 * Minimal Wikimedia client (Wikidata Query Service, Wikidata and Commons
 * action APIs, upload server), following the Wikimedia API etiquette:
 * identified User-Agent, sequential requests.
 */

import { isUploadUrl } from "./wikimedia.normalizer";

const USER_AGENT = "Navventura/1.0 (https://navventura.fr; contact@navventura.fr)";
const REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export interface WikimediaApi {
  sparql(query: string): Promise<unknown>;
  wikidata(params: Record<string, string>): Promise<unknown>;
  commons(params: Record<string, string>): Promise<unknown>;
  download(url: string): Promise<Buffer>;
}

async function postForm(url: string, params: Record<string, string>, accept = "application/json"): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
  return res.json();
}

export const wikimediaApi: WikimediaApi = {
  sparql: (query) =>
    postForm("https://query.wikidata.org/sparql", { query, format: "json" }, "application/sparql-results+json"),

  wikidata: (params) =>
    postForm("https://www.wikidata.org/w/api.php", { format: "json", formatversion: "2", ...params }),

  commons: (params) =>
    postForm("https://commons.wikimedia.org/w/api.php", { format: "json", formatversion: "2", ...params }),

  async download(url) {
    // The URL comes from an API response: never follow it anywhere else.
    if (!isUploadUrl(url)) throw new Error(`Refused download from ${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "error",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
    const length = Number(res.headers.get("content-length"));
    if (length > MAX_DOWNLOAD_BYTES) throw new Error(`File too large (${length} bytes)`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error(`File too large (${buffer.length} bytes)`);
    return buffer;
  },
};
