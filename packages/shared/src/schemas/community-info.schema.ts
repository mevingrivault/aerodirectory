import { z } from "zod";
import { FUEL_TYPES } from "../constants";
import { PaginationSchema } from "./search.schema";

export const COMMUNITY_INFO_KINDS = ["FUEL_PRICE", "LANDING_FEE", "HANGAR", "WEBCAM"] as const;
export type CommunityInfoKind = (typeof COMMUNITY_INFO_KINDS)[number];

/** Aircraft categories for landing and parking fees. */
export const FEE_CATEGORIES = ["ULM", "LIGHT", "HEAVY"] as const;
export const HANGAR_AVAILABILITY = ["YES", "ON_REQUEST", "NO"] as const;

/** Past this age, a price or fee is shown as possibly out of date. */
export const COMMUNITY_INFO_STALE_DAYS: Record<CommunityInfoKind, number | null> = {
  FUEL_PRICE: 180,
  LANDING_FEE: 365,
  HANGAR: 365,
  WEBCAM: null,
};

const MAX_AGE_DAYS = 730;
const DAY_MS = 86_400_000;

const euros = (max: number) => z.number().min(0).max(max).multipleOf(0.01);
const remarks = z.string().trim().max(300).optional();

const observedAt = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(time)) return false;
    const now = Date.now();
    return time <= now + DAY_MS && time >= now - MAX_AGE_DAYS * DAY_MS;
  }, "La date doit être passée et dater de moins de deux ans");

const webUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Lien http ou https attendu");

export const CommunityInfoCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("FUEL_PRICE"),
    observedAt,
    fuelType: z.enum(FUEL_TYPES),
    pricePerLiter: z.number().min(0.5).max(10).multipleOf(0.001),
    remarks,
  }),
  z.object({
    kind: z.literal("LANDING_FEE"),
    observedAt,
    category: z.enum(FEE_CATEGORIES),
    landingFee: euros(1000),
    parkingPerNight: euros(1000).optional(),
    remarks,
  }),
  z.object({
    kind: z.literal("HANGAR"),
    observedAt,
    availability: z.enum(HANGAR_AVAILABILITY),
    pricePerNight: euros(1000).optional(),
    remarks,
  }),
  z.object({
    kind: z.literal("WEBCAM"),
    observedAt,
    url: webUrl,
    label: z.string().trim().min(1).max(80),
  }),
]);

export type CommunityInfoCreateInput = z.infer<typeof CommunityInfoCreateSchema>;

/** What a contribution stands for: a newer approved one with the same key replaces it on the sheet. */
export function communityInfoKey(input: CommunityInfoCreateInput): string {
  switch (input.kind) {
    case "FUEL_PRICE":
      return input.fuelType;
    case "LANDING_FEE":
      return input.category;
    case "HANGAR":
      return "-";
    case "WEBCAM": {
      // Same camera whatever the scheme, host case or trailing slash.
      const [, host = "", rest = ""] = /^https?:\/\/([^/?#]+)([^#]*)/i.exec(input.url) ?? [];
      return `${host.toLowerCase()}${rest.replace(/\/+(?=\?|$)/, "")}`.slice(0, 300);
    }
  }
}

/** The kind-specific fields stored in CommunityInfo.data. */
export function communityInfoData(input: CommunityInfoCreateInput): Record<string, unknown> {
  const { kind: _kind, observedAt: _observedAt, ...data } = input;
  return data;
}

export const AdminCommunityInfosQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(255).optional(),
  state: z.enum(["pending", "approved", "rejected", "all"]).optional(),
});

export const ReviewAdminCommunityInfoSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type AdminCommunityInfosQueryInput = z.infer<typeof AdminCommunityInfosQuerySchema>;
export type ReviewAdminCommunityInfoInput = z.infer<typeof ReviewAdminCommunityInfoSchema>;
