import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { RefreshTokenStore } from "./refresh-token.store";
import { ReplayStore } from "../common/replay-store";

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
 * Two counters: per (account, IP) in the replay store, which is what stops an
 * online guessing run, and per account in the database, which only trips
 * after many more failures spread over several addresses. A single attacker
 * must therefore not be able to lock a victim out with a handful of wrong
 * passwords.
 */

const PER_IP = AuthService.MAX_FAILED_ATTEMPTS_PER_IP;
const PER_ACCOUNT = AuthService.MAX_FAILED_ATTEMPTS_ACCOUNT;

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
  // The database row is mutated by `update` so successive logins observe the
  // account-level counter the way the real service would.
  const row = user ? { ...user } : null;
  const prisma = {
    user: {
      findUnique: vi.fn(async () => (row ? { ...row } : null)),
      update: vi.fn(async ({ data }: { data: Partial<UserRow> }) => {
        if (row) Object.assign(row, data);
        return row;
      }),
    },
  };

  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const replay = new ReplayStore(null);

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
    replay,
    {} as never, // deletion
  );

  return { service, prisma, audit, replay, row };
}

const attempt = (service: AuthService, password: string, ip?: string) =>
  service.login({ email: baseUser.email, password } as never, ip);

describe("AuthService.login lockout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(argon2.hash).mockResolvedValue("hashed");
  });

  it("counts a failed attempt on both counters without locking before the threshold", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { service, prisma, replay } = buildService({ ...baseUser, failedLoginAttempts: 1 });

    await expect(attempt(service, "wrong", "1.1.1.1")).rejects.toThrow("Invalid credentials");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 2 }) }),
    );
    expect(await replay.count("login:fail:user-1:1.1.1.1")).toBe(1);
  });

  it("locks an address out of the account after the per-IP threshold", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { service, audit } = buildService(baseUser);

    for (let i = 1; i < PER_IP; i += 1) {
      await expect(attempt(service, "wrong", "1.1.1.1")).rejects.toThrow("Invalid credentials");
    }
    await expect(attempt(service, "wrong", "1.1.1.1")).rejects.toThrow(/cette adresse/i);

    // Even the right password is refused from that address now.
    vi.mocked(argon2.verify).mockResolvedValue(true);
    await expect(attempt(service, "correct", "1.1.1.1")).rejects.toThrow(/cette adresse/i);

    const locks = audit.log.mock.calls.filter((c) => c[0].action === "ACCOUNT_LOCKED");
    expect(locks).toHaveLength(1);
    expect(locks[0]?.[0].metadata).toMatchObject({ scope: "ip" });
  });

  it("does not lock the account itself: the owner still logs in from another address", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { service } = buildService(baseUser);

    for (let i = 0; i < PER_IP; i += 1) {
      await attempt(service, "wrong", "6.6.6.6").catch(() => undefined);
    }

    vi.mocked(argon2.verify).mockResolvedValue(true);
    await expect(attempt(service, "correct", "9.9.9.9")).resolves.toMatchObject({ requireTotp: false });
  });

  it("locks the account for everyone only after many failures across addresses", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { service, prisma } = buildService({ ...baseUser, failedLoginAttempts: PER_ACCOUNT - 1 });

    await expect(attempt(service, "wrong", "7.7.7.7")).rejects.toThrow(/Compte verrouillé/i);

    const updateArg = prisma.user.update.mock.calls[0]?.[0] as { data: UserRow };
    expect(updateArg.data.failedLoginAttempts).toBe(PER_ACCOUNT);
    expect(updateArg.data.lockedUntil).toBeInstanceOf(Date);
  });

  it("refuses a locked account before checking the password", async () => {
    const verify = vi.mocked(argon2.verify).mockResolvedValue(true);
    const { service } = buildService({
      ...baseUser,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    await expect(attempt(service, "correct", "1.1.1.1")).rejects.toThrow(/verrouill/i);
    expect(verify).not.toHaveBeenCalled();
  });

  it("accepts a correct password once the lock has expired and clears both counters", async () => {
    const { service, prisma, replay } = buildService({
      ...baseUser,
      failedLoginAttempts: PER_ACCOUNT,
      lockedUntil: new Date(Date.now() - 60 * 1000),
    });
    await replay.increment("login:fail:user-1:1.1.1.1", 900);

    await attempt(service, "correct", "1.1.1.1");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLoginAttempts: 0, lockedUntil: null } }),
    );
    expect(await replay.count("login:fail:user-1:1.1.1.1")).toBe(0);
  });

  it("refuses a banned account even with the right password", async () => {
    const { service } = buildService({ ...baseUser, status: "BANNED" });

    await expect(attempt(service, "correct")).rejects.toThrow(/suspendu/i);
  });

  it("refuses an account whose email is not verified", async () => {
    const { service } = buildService({ ...baseUser, emailVerified: null });

    await expect(attempt(service, "correct")).rejects.toThrow(/e-mail/i);
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
