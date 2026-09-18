import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { StorageService } from "../photo/storage.service";

/**
 * Avatar visibility.
 *
 * A member's avatar must follow the same rule as their profile: hidden unless
 * they opted into a public community profile. These tests pin that rule down,
 * because the avatar used to be served straight from the storage bucket, where
 * no such check applied.
 */

type UserRow = {
  id: string;
  displayName: string | null;
  showCommunityProfile: boolean;
  avatarKey: string | null;
};

function buildService(user: UserRow | null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  };

  const storage = {
    getObject: vi.fn().mockResolvedValue({
      stream: "stream",
      contentType: "image/webp",
      contentLength: 1234,
    }),
  };

  const service = new AuthService(
    prisma as never,
    {} as never, // jwt
    { get: vi.fn(), getOrThrow: vi.fn() } as never, // config
    {} as never, // audit
    {} as never, // mail
    storage as never,
    {} as never, // crypto
    {} as never, // sessions
    {} as never, // replay
    {} as never, // deletion
  );

  return { service, prisma, storage };
}

const publicUser: UserRow = {
  id: "user-public",
  displayName: "Alex",
  showCommunityProfile: true,
  avatarKey: "avatars/abc.webp",
};

describe("AuthService.getCommunityAvatar", () => {
  let storageService: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams the avatar of a member with a public profile", async () => {
    const { service, storage } = buildService(publicUser);

    const result = await service.getCommunityAvatar("user-public");

    expect(storage.getObject).toHaveBeenCalledWith("avatars/abc.webp");
    expect(result.contentType).toBe("image/webp");
  });

  it("refuses when the member keeps their profile private", async () => {
    const { service, storage } = buildService({
      ...publicUser,
      showCommunityProfile: false,
    });

    await expect(service.getCommunityAvatar("user-public")).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("refuses when the member has no display name", async () => {
    const { service, storage } = buildService({
      ...publicUser,
      displayName: null,
    });

    await expect(service.getCommunityAvatar("user-public")).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("refuses for an unknown user", async () => {
    const { service, storage } = buildService(null);

    await expect(service.getCommunityAvatar("nobody")).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("refuses when a public member has no avatar", async () => {
    const { service, storage } = buildService({
      ...publicUser,
      avatarKey: null,
    });

    await expect(service.getCommunityAvatar("user-public")).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObject).not.toHaveBeenCalled();
  });
});

describe("AuthService.getOwnAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams the owner's avatar even while their profile is private", async () => {
    const { service, storage } = buildService({
      ...publicUser,
      showCommunityProfile: false,
    });

    const result = await service.getOwnAvatar("user-public");

    expect(storage.getObject).toHaveBeenCalledWith("avatars/abc.webp");
    expect(result.contentType).toBe("image/webp");
  });

  it("refuses when the owner has no avatar", async () => {
    const { service } = buildService({ ...publicUser, avatarKey: null });

    await expect(service.getOwnAvatar("user-public")).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("StorageService avatar URLs", () => {
  // The S3 client refuses to build without a region, so hand the config the
  // defaults the service asks for.
  const storage = new StorageService({
    get: vi.fn((key: string, fallback?: string) =>
      key === "S3_REGION" ? "auto" : (fallback ?? "test"),
    ),
  } as never);

  it("points community avatars at the access-checked endpoint", () => {
    expect(storage.resolveAvatarUrl("user-1", "avatars/abc.webp")).toBe(
      "/auth/community/user-1/avatar",
    );
  });

  it("never leaks a storage path in the community URL", () => {
    const url = storage.resolveAvatarUrl("user-1", "avatars/secret.webp");

    expect(url).not.toContain("avatars/secret.webp");
  });

  it("points the owner's avatar at their own endpoint", () => {
    expect(storage.resolveOwnAvatarUrl("avatars/abc.webp")).toBe(
      "/auth/profile/avatar",
    );
  });

  it("returns null when there is no avatar", () => {
    expect(storage.resolveAvatarUrl("user-1", null)).toBeNull();
    expect(storage.resolveOwnAvatarUrl(null)).toBeNull();
  });
});
