import { describe, it, expect, vi } from "vitest";
import { InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { AccountDeletionService } from "./account-deletion.service";

/**
 * Account purge.
 *
 * Whoever triggers the deletion, every stored object must go and the row
 * must stay if any object cannot be removed: a half-deleted account with
 * orphaned photos is worse than a failed request.
 */

function build(user: Record<string, unknown> | null, failOn: string[] = []) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const storage = {
    delete: vi.fn(async (key: string) => {
      if (failOn.includes(key)) throw new Error("S3 down");
    }),
  };
  const service = new AccountDeletionService(prisma as never, storage as never);
  return { service, prisma, storage };
}

const user = {
  id: "u1",
  email: "pilote@example.fr",
  avatarKey: "avatars/a.webp",
  photos: [{ storedKey: "photos/1.jpg" }, { storedKey: "photos/2.webp" }, { storedKey: "" }],
};

describe("AccountDeletionService.purge", () => {
  it("removes photos and avatar, anonymises logs, then deletes the row", async () => {
    const { service, prisma, storage } = build(user);

    const result = await service.purge("u1");

    expect(storage.delete).toHaveBeenCalledTimes(3);
    expect(storage.delete).toHaveBeenCalledWith("photos/1.jpg");
    expect(storage.delete).toHaveBeenCalledWith("photos/2.webp");
    expect(storage.delete).toHaveBeenCalledWith("avatars/a.webp");
    expect(prisma.auditLog.updateMany).toHaveBeenCalled();
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(result.deletedObjects).toBe(3);
  });

  it("keeps the account when a stored object cannot be removed", async () => {
    const { service, prisma } = build(user, ["photos/2.webp"]);

    await expect(service.purge("u1")).rejects.toThrow(InternalServerErrorException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("keeps the account when the audit logs cannot be anonymised", async () => {
    const { service, prisma, storage } = build(user);
    prisma.auditLog.updateMany.mockRejectedValue(new Error("db"));

    await expect(service.purge("u1")).rejects.toThrow(InternalServerErrorException);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("404s on an unknown user", async () => {
    const { service } = build(null);

    await expect(service.purge("nope")).rejects.toThrow(NotFoundException);
  });
});
