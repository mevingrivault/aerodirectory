import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommentService, REPORT_AUTO_FLAG_THRESHOLD } from "./comment.service";

/**
 * Reporting a comment.
 *
 * A single report must not hide a comment: that would let any member censor
 * any other. The comment is only pulled from view once enough distinct
 * members have reported it, and the admin queue gets every report either way.
 */

function build(pendingReporters: string[]) {
  const prisma = {
    comment: {
      findUnique: vi.fn().mockResolvedValue({
        id: "c1",
        userId: "author",
        aerodromeId: "ad1",
        deletedAt: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    report: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(pendingReporters.map((userId) => ({ userId }))),
      create: vi.fn().mockResolvedValue({ id: "r1" }),
    },
  };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const service = new CommentService(prisma as never, audit as never, {} as never);
  return { service, prisma, audit };
}

const input = { targetType: "comment" as const, targetId: "c1", reason: "spam" };

describe("CommentService.createReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the first report without hiding the comment", async () => {
    const { service, prisma, audit } = build(["reporter-1"]);

    await service.createReport("reporter-1", "ad1", input);

    expect(prisma.report.create).toHaveBeenCalled();
    expect(prisma.comment.updateMany).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ autoFlagged: false }) }),
    );
  });

  it("hides the comment once the threshold of distinct reporters is reached", async () => {
    const reporters = Array.from({ length: REPORT_AUTO_FLAG_THRESHOLD }, (_, i) => `reporter-${i}`);
    const { service, prisma } = build(reporters);

    await service.createReport(reporters[0]!, "ad1", input);

    expect(prisma.comment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", contentStatus: "APPROVED" },
        data: { contentStatus: "FLAGGED" },
      }),
    );
  });

  it("does not count repeated reports from the same member towards the threshold", async () => {
    const same = Array.from({ length: REPORT_AUTO_FLAG_THRESHOLD + 2 }, () => "reporter-1");
    const { service, prisma } = build(same);

    await service.createReport("reporter-1", "ad1", input);

    expect(prisma.comment.updateMany).not.toHaveBeenCalled();
  });

  it("accepts a report on the aerodrome sheet itself without hiding anything", async () => {
    const { service, prisma } = build([]);
    (prisma as Record<string, unknown>)["aerodrome"] = {
      findUnique: vi.fn().mockResolvedValue({ id: "ad1" }),
    };

    await service.createReport("reporter-1", "ad1", { targetType: "aerodrome", targetId: "ad1", reason: "Fermé" });

    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetType: "aerodrome", targetId: "ad1" }) }),
    );
    expect(prisma.comment.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an aerodrome report whose target does not match the route", async () => {
    const { service, prisma } = build([]);

    await expect(
      service.createReport("reporter-1", "ad1", { targetType: "aerodrome", targetId: "ad2", reason: "x" }),
    ).rejects.toThrow(/incohérent/i);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it("refuses to report one's own comment", async () => {
    const { service, prisma } = build([]);

    await expect(service.createReport("author", "ad1", input)).rejects.toThrow(/propre commentaire/i);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it("refuses a second pending report from the same member", async () => {
    const { service, prisma } = build([]);
    prisma.report.findFirst.mockResolvedValue({ id: "existing" });

    await expect(service.createReport("reporter-1", "ad1", input)).rejects.toThrow(/déjà signalé/i);
  });
});
