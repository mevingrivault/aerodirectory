/** Roles in ascending privilege order */
export const ROLES = ["VISITOR", "MEMBER", "MODERATOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const SURFACE_TYPES = [
  "ASPHALT",
  "CONCRETE",
  "GRASS",
  "GRAVEL",
  "DIRT",
  "WATER",
  "OTHER",
] as const;

export const AERODROME_TYPES = [
  "SMALL_AIRPORT",
  "INTERNATIONAL_AIRPORT",
  "GLIDER_SITE",
  "ULTRALIGHT_FIELD",
  "HELIPORT",
  "MILITARY",
  "SEAPLANE_BASE",
  "OTHER",
] as const;

export const FREQUENCY_TYPES = [
  "TWR",
  "AFIS",
  "ATIS",
  "APP",
  "UNICOM",
  "GROUND",
  "CTAF",
  "FIS",
  "OTHER",
] as const;

export const FUEL_TYPES = ["AVGAS_100LL", "UL91", "JET_A1", "SP98"] as const;

export const FUEL_LABELS: Record<string, string> = {
  AVGAS_100LL: "100LL",
  JET_A1: "JET A1",
  SP98: "SP98",
  UL91: "UL91",
};

export const VISIT_STATUSES = ["SEEN", "VISITED", "FAVORITE"] as const;

export const BADGES = [
  { id: "first_flight", name: "Premier Vol", description: "Visitez votre premier aérodrome", threshold: 1 },
  { id: "five_fields", name: "Pilote du Week-end", description: "Visitez 5 aérodromes", threshold: 5 },
  { id: "ten_fields", name: "Explorateur", description: "Visitez 10 aérodromes", threshold: 10 },
  { id: "twentyfive_fields", name: "Aventurier", description: "Visitez 25 aérodromes", threshold: 25 },
  { id: "fifty_fields", name: "Vétéran", description: "Visitez 50 aérodromes", threshold: 50 },
  { id: "hundred_fields", name: "Légende", description: "Visitez 100 aérodromes", threshold: 100 },
] as const;

export const DISCLAIMER =
  "Informations fournies à titre indicatif uniquement. Consultez toujours l'AIP officiel et les NOTAM avant le vol.";

export const MAX_COMMENT_LENGTH = 2000;
export const MAX_SEARCH_RADIUS_KM = 500;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
