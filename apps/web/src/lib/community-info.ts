import {
  COMMUNITY_INFO_STALE_DAYS,
  FUEL_LABELS,
  type CommunityInfoItem,
} from "@aerodirectory/shared";

export const FEE_CATEGORY_LABELS: Record<string, string> = {
  ULM: "ULM",
  LIGHT: "Avion ≤ 1,5 t",
  HEAVY: "Avion > 1,5 t",
};

export const HANGAR_LABELS: Record<string, string> = {
  YES: "Hangar de passage disponible",
  ON_REQUEST: "Hangar sur demande",
  NO: "Pas de hangar de passage",
};

export const COMMUNITY_KIND_LABELS: Record<CommunityInfoItem["kind"], string> = {
  FUEL_PRICE: "Prix carburant",
  LANDING_FEE: "Taxe d'atterrissage / parking",
  HANGAR: "Hangar de passage",
  WEBCAM: "Webcam",
};

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const euroPerLiter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function formatEuros(value: unknown): string | null {
  return typeof value === "number" ? euro.format(value) : null;
}

/** "2,95 €/L" */
export function formatPricePerLiter(value: unknown): string | null {
  return typeof value === "number" ? `${euroPerLiter.format(value)} €/L` : null;
}

export function fuelLabel(key: string): string {
  return FUEL_LABELS[key] ?? key;
}

/** True once a price or fee is older than its kind's shelf life. */
export function isStale(item: Pick<CommunityInfoItem, "kind" | "observedAt">, now = Date.now()): boolean {
  const days = COMMUNITY_INFO_STALE_DAYS[item.kind];
  if (days == null) return false;
  return now - Date.parse(item.observedAt) > days * 86_400_000;
}

/** One-line summary of a contribution, for the sheet and the admin queue. */
export function communityInfoSummary(item: Pick<CommunityInfoItem, "kind" | "key" | "data">): string {
  const d = item.data;
  const remarks = typeof d["remarks"] === "string" && d["remarks"] ? ` — ${d["remarks"]}` : "";
  switch (item.kind) {
    case "FUEL_PRICE":
      return `${fuelLabel(item.key)} : ${formatPricePerLiter(d["pricePerLiter"]) ?? "?"}${remarks}`;
    case "LANDING_FEE": {
      const landing = d["landingFee"] === 0 ? "atterrissage gratuit" : `atterrissage ${formatEuros(d["landingFee"]) ?? "?"}`;
      const parking = formatEuros(d["parkingPerNight"]);
      return `${FEE_CATEGORY_LABELS[item.key] ?? item.key} : ${landing}${parking ? `, parking ${parking}/nuit` : ""}${remarks}`;
    }
    case "HANGAR": {
      const price = formatEuros(d["pricePerNight"]);
      return `${HANGAR_LABELS[String(d["availability"])] ?? "Hangar"}${price ? `, ${price}/nuit` : ""}${remarks}`;
    }
    case "WEBCAM":
      return `${String(d["label"] ?? "Webcam")} — ${String(d["url"] ?? "")}`;
  }
}

/** Only http(s) links ever reach an href, whatever was stored. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
