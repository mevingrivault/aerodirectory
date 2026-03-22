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

export const FUEL_TYPES = ["AVGAS_100LL", "UL91", "JET_A1"] as const;

export const VISIT_STATUSES = ["SEEN", "VISITED", "FAVORITE"] as const;

export const BADGES = [
  { id: "first_flight", name: "First Flight", description: "Visit your first aerodrome", threshold: 1 },
  { id: "five_fields", name: "Weekend Pilot", description: "Visit 5 aerodromes", threshold: 5 },
  { id: "ten_fields", name: "Explorer", description: "Visit 10 aerodromes", threshold: 10 },
  { id: "twentyfive_fields", name: "Adventurer", description: "Visit 25 aerodromes", threshold: 25 },
  { id: "fifty_fields", name: "Veteran", description: "Visit 50 aerodromes", threshold: 50 },
  { id: "hundred_fields", name: "Legend", description: "Visit 100 aerodromes", threshold: 100 },
] as const;

export const DISCLAIMER =
  "Informations fournies à titre indicatif uniquement. Consultez toujours l'AIP officiel et les NOTAM avant le vol.";

export const MAX_COMMENT_LENGTH = 2000;
export const MAX_SEARCH_RADIUS_KM = 500;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
