/**
 * Cam-Aéro importer — lists the weather webcams of cam-aero.eu and links
 * each one to its aerodrome by the ICAO code that starts its name
 * ("LFBP_AeroclubDuBearn"). Only the viewer page URL is kept: images stay on
 * Cam-Aéro and browsers never load them from our pages.
 *
 * The whole table is rebuilt in one transaction; a list that looks truncated
 * throws and keeps the previous one.
 */

import type { PrismaClient } from "@aerodirectory/database";
import { z } from "zod";

export const CAM_AERO_LIST_URL = "https://cam-aero.eu/raspicamaero/mosaic/list";
const CAM_AERO_BASE = "https://cam-aero.eu/raspicamaero/";
const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "Navventura/1.0 (https://navventura.fr; contact@navventura.fr)";
/** 71 active cameras on French fields in November 2026. */
export const MIN_EXPECTED_WEBCAMS = 30;

const ListSchema = z.object({
  cams: z.array(
    z.object({
      lfxx_acb: z.string(),
      time: z.number().nullish(),
      old: z.boolean().nullish(),
    }),
  ),
});

export interface CamAeroWebcam {
  sourceId: string;
  icaoCode: string;
  label: string;
  pageUrl: string;
  lastImageAt: Date | null;
}

const NAME_PATTERN = /^(LF[A-Z]{2})_([A-Za-z0-9_-]{1,80})$/;

/** "AeroclubDuBearn" → "Aeroclub Du Bearn", "Aeroclub_Albi2" → "Aeroclub Albi 2". */
export function humanizeCamName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Active cameras on a French ICAO aerodrome; others (old, ULM fields "LF4724_…", abroad) are skipped. */
export function normalizeCamAeroList(raw: unknown): CamAeroWebcam[] {
  const { cams } = ListSchema.parse(raw);
  const webcams: CamAeroWebcam[] = [];
  for (const cam of cams) {
    if (cam.old) continue;
    const match = NAME_PATTERN.exec(cam.lfxx_acb);
    if (!match) continue;
    const [, icaoCode, name] = match;
    webcams.push({
      sourceId: cam.lfxx_acb,
      icaoCode: icaoCode!,
      label: humanizeCamName(name!) || icaoCode!,
      pageUrl: `${CAM_AERO_BASE}${cam.lfxx_acb}/img`,
      lastImageAt: cam.time ? new Date(cam.time * 1000) : null,
    });
  }
  return webcams;
}

export async function fetchCamAeroList(): Promise<unknown> {
  const res = await fetch(CAM_AERO_LIST_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cam-Aéro : HTTP ${res.status}`);
  // Served as text/html, so parse the body ourselves.
  return JSON.parse(await res.text());
}

export interface CamAeroImportResult {
  listed: number;
  active: number;
  imported: number;
  unknownIcao: string[];
}

export async function syncCamAeroWebcams(
  prisma: PrismaClient,
  fetchList: () => Promise<unknown> = fetchCamAeroList,
): Promise<CamAeroImportResult> {
  const raw = await fetchList();
  const webcams = normalizeCamAeroList(raw);
  if (webcams.length < MIN_EXPECTED_WEBCAMS) {
    throw new Error(`Seulement ${webcams.length} webcams reçues de Cam-Aéro ; liste existante conservée.`);
  }

  const codes = [...new Set(webcams.map((w) => w.icaoCode))];
  const aerodromes = await prisma.aerodrome.findMany({
    where: { icaoCode: { in: codes } },
    select: { id: true, icaoCode: true },
  });
  const idByIcao = new Map(aerodromes.map((a) => [a.icaoCode!, a.id]));

  const rows = webcams
    .filter((w) => idByIcao.has(w.icaoCode))
    .map(({ icaoCode, ...w }) => ({ ...w, aerodromeId: idByIcao.get(icaoCode)! }));

  await prisma.$transaction(async (tx) => {
    await tx.webcam.deleteMany({});
    await tx.webcam.createMany({ data: rows });
  });

  return {
    listed: (raw as { cams?: unknown[] }).cams?.length ?? 0,
    active: webcams.length,
    imported: rows.length,
    unknownIcao: codes.filter((code) => !idByIcao.has(code)),
  };
}
