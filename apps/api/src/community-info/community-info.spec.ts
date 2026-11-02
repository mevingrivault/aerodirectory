import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { CommunityInfoCreateSchema, communityInfoKey } from "@aerodirectory/shared";
import { CommunityInfoService, latestPerKey } from "./community-info.service";

const today = new Date().toISOString().slice(0, 10);

describe("CommunityInfoCreateSchema", () => {
  it("accepts a fuel price and keeps cents", () => {
    const parsed = CommunityInfoCreateSchema.parse({
      kind: "FUEL_PRICE",
      observedAt: today,
      fuelType: "AVGAS_100LL",
      pricePerLiter: 2.95,
    });
    expect(parsed).toMatchObject({ pricePerLiter: 2.95 });
  });

  it("rejects a future date, a date over two years old and an absurd price", () => {
    const base = { kind: "FUEL_PRICE", fuelType: "UL91", pricePerLiter: 2.5 };
    expect(CommunityInfoCreateSchema.safeParse({ ...base, observedAt: "2999-01-01" }).success).toBe(false);
    expect(CommunityInfoCreateSchema.safeParse({ ...base, observedAt: "2020-01-01" }).success).toBe(false);
    expect(CommunityInfoCreateSchema.safeParse({ ...base, observedAt: today, pricePerLiter: 25 }).success).toBe(false);
  });

  it("only takes http and https webcam links", () => {
    const webcam = (url: string) =>
      CommunityInfoCreateSchema.safeParse({ kind: "WEBCAM", observedAt: today, url, label: "Piste 27" }).success;
    expect(webcam("https://example.org/cam")).toBe(true);
    expect(webcam("javascript:alert(1)")).toBe(false);
    expect(webcam("ftp://example.org/cam")).toBe(false);
  });

  it("gives the same key to the same camera however the link is written", () => {
    const key = (url: string) => communityInfoKey({ kind: "WEBCAM", observedAt: today, url, label: "x" });
    expect(key("HTTPS://Example.org/cam/")).toBe(key("http://example.org/cam"));
    expect(key("https://example.org/cam?id=2")).not.toBe(key("https://example.org/cam?id=1"));
  });
});

describe("latestPerKey", () => {
  it("keeps the newest entry per kind and key", () => {
    const rows = [
      { id: "new-100ll", kind: "FUEL_PRICE", key: "AVGAS_100LL" },
      { id: "ul91", kind: "FUEL_PRICE", key: "UL91" },
      { id: "old-100ll", kind: "FUEL_PRICE", key: "AVGAS_100LL" },
      { id: "hangar", kind: "HANGAR", key: "-" },
    ];
    expect(latestPerKey(rows).map((r) => r.id)).toEqual(["new-100ll", "ul91", "hangar"]);
  });
});

describe("CommunityInfoService.propose", () => {
  const build = (pending: { id: string } | null) => {
    const prisma = {
      aerodrome: { findUnique: vi.fn().mockResolvedValue({ id: "ad1" }) },
      communityInfo: {
        findFirst: vi.fn().mockResolvedValue(pending),
        create: vi.fn().mockResolvedValue({ id: "ci1", kind: "FUEL_PRICE", key: "AVGAS_100LL", contentStatus: "PENDING" }),
      },
    };
    const audit = { log: vi.fn() };
    return { prisma, audit, service: new CommunityInfoService(prisma as never, audit as never, {} as never) };
  };
  const input = { kind: "FUEL_PRICE" as const, observedAt: "2026-10-12", fuelType: "AVGAS_100LL" as const, pricePerLiter: 2.95 };

  it("stores the kind fields apart from the date, pending review", async () => {
    const { service, prisma, audit } = build(null);
    await service.propose("u1", "ad1", input);

    expect(prisma.communityInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: "u1",
          aerodromeId: "ad1",
          kind: "FUEL_PRICE",
          key: "AVGAS_100LL",
          data: { fuelType: "AVGAS_100LL", pricePerLiter: 2.95 },
          observedAt: new Date("2026-10-12T00:00:00Z"),
        },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "COMMUNITY_INFO_PROPOSE" }));
  });

  it("refuses a second pending entry for the same thing", async () => {
    const { service, prisma } = build({ id: "ci0" });
    await expect(service.propose("u1", "ad1", input)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.communityInfo.create).not.toHaveBeenCalled();
  });
});
