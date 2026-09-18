import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { RefreshTokenStore } from "./refresh-token.store";

// argon2 is an ESM export, so it has to be mocked at module level rather than
// spied on per test.
vi.mock("argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed"),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}));

/**
 * Login lockout.
 *
 * Five failed attempts lock the account for fifteen minutes. These tests cover
 * the counter, the lock itself, and the reset on success — the parts that stop
 * an online password guessing run.
 */

const MAX_ATTEMPTS = 5;

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  status: string;
  emailVerified: Date | null;
  totpEnabled: boolean;
  role: string;
  tokenVersion: number;
};

const baseUser: UserRow = {
  id: "user-1",
  email: "pilote@example.fr",
  passwordHash: "hash",
  failedLoginAttempts: 0,
  lockedUntil: null,
  status: "ACTIVE",
  emailVerified: new Date("2026-01-01"),
  totpEnabled: false,
  role: "MEMBER",
  tokenVersion: 0,
};

function buildService(user: UserRow | null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    },
  };

  const audit = { log: vi.fn().mockResolvedValue(undefined) };

  const service = new AuthService(
    prisma as never,
    {
      sign: vi.fn().mockReturnValue("token"),
      signAsync: vi.fn().mockResolvedValue("token"),
    } as never,
    { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue("secret") } as never,
    audit as never,
    {} as never, // mail
    {} as never, // storage
    {} as never, // crypto
    new RefreshTokenStore(null),
  );

  return { service, prisma, audit };
}

describe("AuthService.login lockout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(argon2.hash).mockResolvedValue("hashed");
  });

  it("counts a failed attempt without locking before the threshold", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { service, prisma } = buildService({
      ...baseUser,
      failedLoginAttempts: 1,
    });

    await expect(
      service.login({ email: baseUser.email, password: "wrong" } as never),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 2 }),
      }),
    );
  });

  it("locks the account on the fifth failed attempt", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { service, prisma, audit } = buildService({
      ...baseUser,
      failedLoginAttempts: MAX_ATTEMPTS - 1,
    });

    await expect(
      service.login({ email: baseUser.email, password: "wrong" } as never),
    ).rejects.toThrow(/verrouill/i);

    const updateArg = prisma.user.update.mock.calls[0]?.[0];
    expect(updateArg.data.failedLoginAttempts).toBe(MAX_ATTEMPTS);
    expect(updateArg.data.lockedUntil).toBeInstanceOf(Date);

    const actions = audit.log.mock.calls.map((call) => call[0].action);
    expect(actions).toContain("ACCOUNT_LOCKED");
  });

  it("refuses a locked account before checking the password", async () => {
    const verify = vi.mocked(argon2.verify).mockResolvedValue(true);
    const { service } = buildService({
      ...baseUser,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    await expect(
      service.login({ email: baseUser.email, password: "correct" } as never),
    ).rejects.toThrow(/verrouill/i);

    expect(verify).not.toHaveBeenCalled();
  });

  it("accepts a correct password once the lock has expired", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const { service, prisma } = buildService({
      ...baseUser,
      failedLoginAttempts: MAX_ATTEMPTS,
      lockedUntil: new Date(Date.now() - 60 * 1000),
    });

    await service.login({
      email: baseUser.email,
      password: "correct",
    } as never);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { failedLoginAttempts: 0, lockedUntil: null },
      }),
    );
  });

  it("refuses a banned account even with the right password", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const { service } = buildService({ ...baseUser, status: "BANNED" });

    await expect(
      service.login({ email: baseUser.email, password: "correct" } as never),
    ).rejects.toThrow(/suspendu/i);
  });

  it("refuses an account whose email is not verified", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const { service } = buildService({ ...baseUser, emailVerified: null });

    await expect(
      service.login({ email: baseUser.email, password: "correct" } as never),
    ).rejects.toThrow(/e-mail/i);
  });

  it("hashes a dummy password for an unknown email, to keep timing flat", async () => {
    const hash = vi.mocked(argon2.hash).mockResolvedValue("dummy");
    const { service } = buildService(null);

    await expect(
      service.login({ email: "nobody@example.fr", password: "x" } as never),
    ).rejects.toThrow(UnauthorizedException);

    expect(hash).toHaveBeenCalled();
  });
});
