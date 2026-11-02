/**
 * AIRAC cycles and the URLs of the SIA's published documents.
 *
 * The SIA serves only the cycle in force: the previous one is removed and
 * the next one appears on its effective date. Links are therefore computed
 * when shown, never stored.
 */

// A known AIRAC effective date (cycle 2401); cycles follow every 28 days.
const AIRAC_EPOCH_MS = Date.UTC(2024, 0, 25);
const CYCLE_MS = 28 * 24 * 60 * 60 * 1000;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const SIA_BASE = "https://www.sia.aviation-civile.gouv.fr/media/dvd";

export interface AiracCycle {
  /** Effective date, 00:00 UTC. */
  effective: Date;
  /** Next cycle's effective date. */
  next: Date;
  /** "29_OCT_2026", as in the SIA's folder names. */
  folder: string;
  /** "2026-10-29" */
  isoDate: string;
}

export function airacCycle(at: Date, offset = 0): AiracCycle {
  const index = Math.floor((at.getTime() - AIRAC_EPOCH_MS) / CYCLE_MS) + offset;
  const effective = new Date(AIRAC_EPOCH_MS + index * CYCLE_MS);
  const day = String(effective.getUTCDate()).padStart(2, "0");
  return {
    effective,
    next: new Date(effective.getTime() + CYCLE_MS),
    folder: `${day}_${MONTHS[effective.getUTCMonth()]}_${effective.getUTCFullYear()}`,
    isoDate: effective.toISOString().slice(0, 10),
  };
}

/** Metropolitan ICAO codes: the only ones in the SIA's eAIP France and VAC atlas. */
export const SIA_ICAO = /^LF[A-Z]{2}$/;

export function vacUrl(icao: string, cycle: AiracCycle): string {
  return `${SIA_BASE}/eAIP_${cycle.folder}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;
}

export function ad2Url(icao: string, cycle: AiracCycle): string {
  return `${SIA_BASE}/eAIP_${cycle.folder}/FRANCE/AIRAC-${cycle.isoDate}/html/eAIP/FR-AD-2.${icao}-fr-FR.html`;
}
