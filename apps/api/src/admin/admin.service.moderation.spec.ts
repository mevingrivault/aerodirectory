import { describe, it, expect, beforeEach, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminService } from "./admin.service";

vi.mock("argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed"),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}));

/**
 * Moderation of community content.
 *
 * Comments and events from accounts younger than seven days are created as
 * PENDING; corrections always are. Each needs a path to APPROVED (published)
 * and to REJECTED (kept but hidden), and none of them may touch the aerodrome
 * itself.
 */

function build() {
  const prisma = {
    comment: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    report: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    correction: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    aerodromeEvent: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    aerodrome: {
      findUnique: vi.fn().mockResolvedValue({ name: "Toussus" }),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const notifications = { notifyUser: vi.fn().mockResolvedValue(undefined), notifyUsers: vi.fn() };
  const deletion = { purge: vi.fn().mockResolvedValue({ deletedObjects: 2 }) };
  const service = new AdminService(
    prisma as never,
    audit as never,
    notifications as never,
    {} as never,
    deletion as never,
  );
  return { service, prisma, audit, notifications, deletion };
}

const pendingComment = {
  id: "c1",
  userId: "author",
  content: "Belle piste",
  aerodromeId: "ad1",
  deletedAt: null,
  contentStatus: "PENDING",
};

describe("AdminService comment moderation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes a pending comment and tells the author", async () => {
    const { service, prisma, audit, notifications } = build();
    prisma.comment.findUnique.mockResolvedValue(pendingComment);

    await service.approveComment("admin", "c1", {});

    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { contentStatus: "APPROVED" } }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "COMMENT_APPROVE" }));
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "author", type: "COMMENT_APPROVED" }),
    );
  });

  it("restores a flagged comment and closes its pending reports", async () => {
    const { service, prisma, audit } = build();
    prisma.comment.findUnique.mockResolvedValue({ ...pendingComment, contentStatus: "FLAGGED" });

    await service.approveComment("admin", "c1", { note: "ok" });

    expect(prisma.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetId: "c1", contentStatus: "PENDING" }),
        data: expect.objectContaining({ contentStatus: "REJECTED", reviewedBy: "admin" }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "ADMIN_ACTION" }));
  });

  it("refuses to approve an already published comment", async () => {
    const { service, prisma } = build();
    prisma.comment.findUnique.mockResolvedValue({ ...pendingComment, contentStatus: "APPROVED" });

    await expect(service.approveComment("admin", "c1", {})).rejects.toThrow(BadRequestException);
    expect(prisma.comment.update).not.toHaveBeenCalled();
  });

  it("rejects a pending comment without deleting it", async () => {
    const { service, prisma, notifications } = build();
    prisma.comment.findUnique.mockResolvedValue(pendingComment);

    await service.rejectComment("admin", "c1", { note: "hors sujet" });

    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { contentStatus: "REJECTED" } }),
    );
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "author", type: "COMMENT_REJECTED" }),
    );
  });

  it("marks the reports as upheld when rejecting a flagged comment", async () => {
    const { service, prisma } = build();
    prisma.comment.findUnique.mockResolvedValue({ ...pendingComment, contentStatus: "FLAGGED" });

    await service.rejectComment("admin", "c1", {});

    expect(prisma.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contentStatus: "APPROVED" }) }),
    );
  });

  it("404s on an unknown comment", async () => {
    const { service, prisma } = build();
    prisma.comment.findUnique.mockResolvedValue(null);

    await expect(service.approveComment("admin", "nope", {})).rejects.toThrow(NotFoundException);
  });
});

describe("AdminService.deleteUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("goes through the shared purge so stored files are removed too", async () => {
    const { service, prisma, deletion, audit } = build();
    const userDelegate = {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "admin"
          ? { id: "admin", passwordHash: "hash" }
          : { id: "victim", role: "MEMBER", email: "v@example.fr", displayName: "V" }),
      delete: vi.fn(),
    };
    (prisma as Record<string, unknown>)["user"] = userDelegate;

    await service.deleteUser("admin", "victim", { currentPassword: "correct-password" });

    expect(deletion.purge).toHaveBeenCalledWith("victim");
    expect(userDelegate.delete).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ deletedObjects: 2 }) }),
    );
  });
});

describe("AdminService correction moderation", () => {
  beforeEach(() => vi.clearAllMocks());

  const correction = {
    id: "k1",
    userId: "author",
    aerodromeId: "ad1",
    field: "fuel",
    proposedValue: "100LL",
    contentStatus: "PENDING",
  };

  it("approves a correction without touching the aerodrome", async () => {
    const { service, prisma, notifications } = build();
    prisma.correction.findUnique.mockResolvedValue(correction);

    await service.approveCorrection("admin", "k1", {});

    expect(prisma.correction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contentStatus: "APPROVED" }) }),
    );
    expect(prisma.aerodrome.update).not.toHaveBeenCalled();
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CORRECTION_APPROVED" }),
    );
  });

  it("rejects a correction", async () => {
    const { service, prisma } = build();
    prisma.correction.findUnique.mockResolvedValue(correction);

    await service.rejectCorrection("admin", "k1", { note: "faux" });

    expect(prisma.correction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contentStatus: "REJECTED" }) }),
    );
    expect(prisma.aerodrome.update).not.toHaveBeenCalled();
  });
});

describe("AdminService event moderation", () => {
  beforeEach(() => vi.clearAllMocks());

  const event = {
    id: "e1",
    userId: "author",
    title: "Café croissant",
    aerodromeId: "ad1",
    contentStatus: "PENDING",
    aerodrome: { name: "Toussus" },
  };

  it("publishes a pending event", async () => {
    const { service, prisma, audit, notifications } = build();
    prisma.aerodromeEvent.findUnique.mockResolvedValue(event);

    await service.approveEvent("admin", "e1", {});

    expect(prisma.aerodromeEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentStatus: "APPROVED", reviewedBy: "admin" }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "EVENT_APPROVE" }));
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "author", type: "EVENT_APPROVED" }),
    );
  });

  it("rejects a pending event", async () => {
    const { service, prisma, audit } = build();
    prisma.aerodromeEvent.findUnique.mockResolvedValue(event);

    await service.rejectEvent("admin", "e1", { note: "doublon" });

    expect(prisma.aerodromeEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contentStatus: "REJECTED" }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "EVENT_REJECT" }));
  });

  it("refuses a no-op decision", async () => {
    const { service, prisma } = build();
    prisma.aerodromeEvent.findUnique.mockResolvedValue({ ...event, contentStatus: "APPROVED" });

    await expect(service.approveEvent("admin", "e1", {})).rejects.toThrow(BadRequestException);
  });
});
