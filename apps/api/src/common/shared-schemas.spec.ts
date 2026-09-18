import { describe, it, expect } from "vitest";
import {
  AerodromeSearchSchema,
  NearbySchema,
  NotificationsQuerySchema,
  ReportCreateSchema,
} from "@aerodirectory/shared";

/**
 * Query-string booleans.
 *
 * `z.coerce.boolean()` turned the string "false" into `true`, so
 * `?hasRestaurant=false` filtered on restaurants. The schemas now parse the
 * usual spellings and reject anything else.
 */
describe("boolean query parameters", () => {
  it("parses true/false spellings in the search filters", () => {
    expect(AerodromeSearchSchema.parse({ hasRestaurant: "false" }).hasRestaurant).toBe(false);
    expect(AerodromeSearchSchema.parse({ hasRestaurant: "true" }).hasRestaurant).toBe(true);
    expect(AerodromeSearchSchema.parse({ ppr: "0" }).ppr).toBe(false);
    expect(AerodromeSearchSchema.parse({ ppr: "1" }).ppr).toBe(true);
    expect(AerodromeSearchSchema.parse({}).hasRestaurant).toBeUndefined();
  });

  it("rejects garbage instead of silently treating it as true", () => {
    expect(() => AerodromeSearchSchema.parse({ hasBikes: "maybe" })).toThrow();
  });

  it("applies to nearby and notification queries too", () => {
    expect(NearbySchema.parse({ lat: "48", lng: "2", hasFuel: "false" }).hasFuel).toBe(false);
    expect(NotificationsQuerySchema.parse({ unreadOnly: "false" }).unreadOnly).toBe(false);
    expect(NotificationsQuerySchema.parse({ unreadOnly: "true" }).unreadOnly).toBe(true);
  });
});

describe("ReportCreateSchema", () => {
  it("accepts a report on the aerodrome sheet itself", () => {
    const parsed = ReportCreateSchema.parse({
      targetType: "aerodrome",
      targetId: "cm1234567890abcdefghijklm",
      reason: "Piste fermée depuis 2024",
    });

    expect(parsed.targetType).toBe("aerodrome");
  });
});
