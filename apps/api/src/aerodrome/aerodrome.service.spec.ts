import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { AerodromeService, MANUAL_SOURCE } from "./aerodrome.service";

/**
 * Source data protection.
 *
 * Aerodromes come from openAIP; editing one through the API would be undone
 * by the next sync and would break the rule that the community layer never
 * touches imported data. Only hand-made sheets (source "manual") can be
 * changed or deleted, and every change is audited.
 */

function build(existing: Record<string, unknown> | null) {
  const prisma = {
    aerodrome: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data })),
      update: vi.fn().mockResolvedValue({ id: "a1" }),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const service = new AerodromeService(prisma as never, audit as never, {} as never);
  return { service, prisma, audit };
}

const actor = { adminId: "admin", ip: "1.2.3.4" };

describe("AerodromeService writes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps a created sheet as manual and audits it", async () => {
    const { service, prisma, audit } = build(null);

    await service.create({ name: "Terrain privé", latitude: 45, longitude: 3 } as never, actor);

    expect(prisma.aerodrome.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: MANUAL_SOURCE }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin",
        action: "ADMIN_ACTION",
        metadata: expect.objectContaining({ type: "AERODROME_CREATE" }),
      }),
    );
  });

  it("refuses to update a sheet imported from openAIP", async () => {
    const { service, prisma } = build({ id: "a1", name: "LFPN", source: "openaip" });

    await expect(service.update("a1", { name: "Renamed" } as never, actor)).rejects.toThrow(ConflictException);
    expect(prisma.aerodrome.update).not.toHaveBeenCalled();
  });

  it("refuses to delete a sheet imported from openAIP", async () => {
    const { service, prisma } = build({ id: "a1", name: "LFPN", source: "openaip" });

    await expect(service.delete("a1", actor)).rejects.toThrow(ConflictException);
    expect(prisma.aerodrome.delete).not.toHaveBeenCalled();
  });

  it("updates a manual sheet and audits the changed fields", async () => {
    const { service, prisma, audit } = build({ id: "a1", name: "Manual", source: MANUAL_SOURCE });

    await service.update("a1", { name: "Renamed", ppr: true } as never, actor);

    expect(prisma.aerodrome.update).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ type: "AERODROME_UPDATE", fields: ["name", "ppr"] }),
      }),
    );
  });

  it("still allows editing legacy sheets without a source", async () => {
    const { service, prisma } = build({ id: "a1", name: "Legacy", source: null });

    await service.delete("a1", actor);

    expect(prisma.aerodrome.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("404s on an unknown sheet", async () => {
    const { service } = build(null);

    await expect(service.update("nope", {} as never, actor)).rejects.toThrow(NotFoundException);
  });
});
