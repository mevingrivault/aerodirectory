import { describe, it, expect, beforeEach, vi } from "vitest";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService, hashEmailToken } from "./auth.service";
import { RefreshTokenStore } from "./refresh-token.store";
import { ReplayStore } from "../common/replay-store";

vi.mock("argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed"),
  verify: vi.fn().mockResolvedValue(true),
  argon2id: 2,
}));

// The TOTP library is replaced so the tests control code validity directly.
const { totpVerify } = vi.hoisted(() => ({ totpVerify: vi.fn() }));
vi.mock("otplib", () => ({
  TOTP: class {
    verify = totpVerify;
    generateSecret = () => "SECRET";
    toURI = () => "otpauth://totp/x";
  },
}));
vi.mock("@otplib/plugin-crypto-noble", () => ({ NobleCryptoPlugin: class {} }));
vi.mock("@otplib/plugin-base32-scure", () => ({ ScureBase32Plugin: class {} }));

/**
 * Sessions.
 *
 * Three properties are pinned here:
 *  - a refresh token is single use and dies with the user's tokenVersion;
 *  - the TOTP second step only accepts the partial token issued by login();
 *  - password change/reset and TOTP disable behave as revocation events.
 */

type UserRow = Record<string, unknown> & { id: string; email: string; tokenVersion: number };

const baseUser: UserRow = {
  id: "user-1",
  email: "pilote@example.fr",
  passwordHash: "hash",
  role: "MEMBER",
  status: "ACTIVE",
  emailVerified: new Date("2026-01-01"),
  totpEnabled: false,
  totpSecret: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  tokenVersion: 4,
};

/** A JwtService stand-in that "signs" by JSON-encoding the payload. */
function fakeJwt() {
  return {
    sign: vi.fn((payload: object) => JSON.stringify(payload)),
    signAsync: vi.fn(async (payload: object) => JSON.stringify(payload)),
    verifyAsync: vi.fn(async (token: string) => {
      try {
        return JSON.parse(token);
      } catch {
        throw new Error("bad token");
      }
    }),
  };
}

function build(user: UserRow | null, overrides: Partial<UserRow> = {}) {
  const row = user ? { ...user, ...overrides } : null;
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(row),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const jwt = fakeJwt();
  const config = {
    get: vi.fn((key: string) => (key === "JWT_REFRESH_EXPIRES_IN" ? "7d" : undefined)),
    getOrThrow: vi.fn().mockReturnValue("refresh-secret"),
  };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const crypto = { encrypt: vi.fn((v: string) => `enc:${v}`), decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")) };
  const sessions = new RefreshTokenStore(null);
  const replay = new ReplayStore(null);
  const mail = {
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  };

  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
    audit as never,
    mail as never,
    {} as never,
    crypto as never,
    sessions,
    replay,
    {} as never, // deletion
  );

  return { service, prisma, jwt, audit, sessions, mail };
}

const parse = (token: string) => JSON.parse(token) as Record<string, unknown>;

describe("AuthService sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(argon2.verify).mockResolvedValue(true);
    totpVerify.mockResolvedValue({ valid: true });
  });

  describe("login and refresh", () => {
    it("issues versioned tokens and registers the refresh jti", async () => {
      const { service } = build(baseUser);

      const result = await service.login({ email: baseUser.email, password: "x" } as never);

      expect(result.requireTotp).toBe(false);
      expect(parse(result.accessToken)).toMatchObject({ sub: "user-1", ver: 4 });
      const refresh = parse(result.refreshToken);
      expect(refresh).toMatchObject({ sub: "user-1", ver: 4, typ: "refresh" });
      expect(typeof refresh["jti"]).toBe("string");
    });

    it("rotates the refresh token and refuses its reuse", async () => {
      const { service } = build(baseUser);
      const { refreshToken } = await service.login({ email: baseUser.email, password: "x" } as never);

      const rotated = await service.refreshTokens(refreshToken);
      expect(parse(rotated.refreshToken)["jti"]).not.toBe(parse(refreshToken)["jti"]);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(/révoqué|déjà utilisé/i);
    });

    it("refuses an access token presented as a refresh token", async () => {
      const { service } = build(baseUser);
      const { accessToken } = await service.login({ email: baseUser.email, password: "x" } as never);

      await expect(service.refreshTokens(accessToken)).rejects.toThrow(UnauthorizedException);
    });

    it("refuses a refresh token once the user's tokenVersion moved on", async () => {
      const { service, prisma } = build(baseUser);
      const { refreshToken } = await service.login({ email: baseUser.email, password: "x" } as never);

      prisma.user.findUnique.mockResolvedValue({ ...baseUser, tokenVersion: 5 });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(/révoquée/i);
    });

    it("refuses a refresh token for a banned user", async () => {
      const { service, prisma } = build(baseUser);
      const { refreshToken } = await service.login({ email: baseUser.email, password: "x" } as never);

      prisma.user.findUnique.mockResolvedValue({ ...baseUser, status: "BANNED" });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("logout revokes the refresh token", async () => {
      const { service } = build(baseUser);
      const { refreshToken } = await service.login({ email: baseUser.email, password: "x" } as never);

      await service.logout(refreshToken);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("logout tolerates a missing or garbage token", async () => {
      const { service } = build(baseUser);

      await expect(service.logout(undefined)).resolves.toBeUndefined();
      await expect(service.logout("not-a-token")).resolves.toBeUndefined();
    });
  });

  describe("revocation events", () => {
    it("bumps tokenVersion on password change", async () => {
      const { service, prisma } = build(baseUser);

      await service.changePassword("user-1", { currentPassword: "old", newPassword: "New-password-123!" } as never);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
        }),
      );
    });

    it("bumps tokenVersion and clears the lockout on password reset", async () => {
      const { service, prisma } = build(baseUser);
      (prisma as Record<string, unknown>)["emailToken"] = {
        findUnique: vi.fn().mockResolvedValue({
          id: "t1",
          token: hashEmailToken("t"),
          userId: "user-1",
          type: "reset",
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: vi.fn(),
      };

      await service.resetPassword({ token: "t", password: "New-password-123!" } as never);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenVersion: { increment: 1 },
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
    });
  });

  describe("TOTP second step", () => {
    const totpUser: UserRow = { ...baseUser, totpEnabled: true, totpSecret: "enc:SECRET" };

    it("login returns only a partial token when TOTP is enabled", async () => {
      const { service } = build(totpUser);

      const result = await service.login({ email: totpUser.email, password: "x" } as never);

      expect(result.requireTotp).toBe(true);
      expect(result.refreshToken).toBe("");
      expect(parse(result.accessToken)).toMatchObject({ typ: "totp", totpPending: true, ver: 4 });
    });

    it("exchanges the partial token and a valid code for a full session", async () => {
      const { service, audit } = build(totpUser);
      const partial = (await service.login({ email: totpUser.email, password: "x" } as never)).accessToken;

      const tokens = await service.verifyTotpLogin(partial, "123456");

      expect(parse(tokens.accessToken)).toMatchObject({ sub: "user-1", ver: 4 });
      expect(parse(tokens.accessToken)["typ"]).toBeUndefined();
      expect(parse(tokens.refreshToken)["typ"]).toBe("refresh");
      expect(audit.log.mock.calls.some((c) => c[0].action === "LOGIN")).toBe(true);
    });

    it("refuses a full access token as the partial token", async () => {
      const { service } = build(totpUser);
      const forged = JSON.stringify({ sub: "user-1", role: "MEMBER", ver: 4 });

      await expect(service.verifyTotpLogin(forged, "123456")).rejects.toThrow(/not initiated/i);
    });

    it("refuses a partial token whose version is stale", async () => {
      const { service } = build(totpUser);
      const stale = JSON.stringify({ sub: "user-1", role: "MEMBER", ver: 1, typ: "totp", totpPending: true });

      await expect(service.verifyTotpLogin(stale, "123456")).rejects.toThrow(UnauthorizedException);
    });

    it("counts a wrong code as a failed login attempt", async () => {
      totpVerify.mockResolvedValue({ valid: false });
      const { service, prisma } = build(totpUser, { failedLoginAttempts: 1 });
      const partial = (await service.login({ email: totpUser.email, password: "x" } as never)).accessToken;

      await expect(service.verifyTotpLogin(partial, "000000")).rejects.toThrow(/Invalid TOTP/i);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 2 }) }),
      );
    });

    it("locks the address out after too many wrong codes", async () => {
      totpVerify.mockResolvedValue({ valid: false });
      const { service } = build(totpUser);
      const partial = (await service.login({ email: totpUser.email, password: "x" } as never, "5.5.5.5")).accessToken;

      for (let i = 1; i < AuthService.MAX_FAILED_ATTEMPTS_PER_IP; i += 1) {
        await expect(service.verifyTotpLogin(partial, "000000", "5.5.5.5")).rejects.toThrow(/Invalid TOTP/i);
      }
      await expect(service.verifyTotpLogin(partial, "000000", "5.5.5.5")).rejects.toThrow(/cette adresse/i);
    });

    it("refuses a code that was already accepted", async () => {
      const { service } = build(totpUser);
      const first = (await service.login({ email: totpUser.email, password: "x" } as never)).accessToken;
      await service.verifyTotpLogin(first, "123456");

      const second = (await service.login({ email: totpUser.email, password: "x" } as never)).accessToken;

      await expect(service.verifyTotpLogin(second, "123456")).rejects.toThrow(/Invalid TOTP/i);
      await expect(service.verifyTotpLogin(second, "654321")).resolves.toBeDefined();
    });
  });

  describe("e-mail tokens", () => {
    function withEmailTokens(prisma: Record<string, unknown>) {
      const rows: Array<Record<string, unknown>> = [];
      prisma["emailToken"] = {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          rows.push({ id: `t${rows.length}`, usedAt: null, ...data });
          return rows[rows.length - 1];
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn(async ({ where }: { where: { token: string } }) =>
          rows.find((row) => row["token"] === where.token) ?? null),
        update: vi.fn(),
      };
      return rows;
    }

    it("stores only a hash of the verification token and mails the raw one", async () => {
      const { service, prisma, mail } = build(null);
      prisma.user.create.mockResolvedValue({ id: "new", email: "new@example.fr" });
      const rows = withEmailTokens(prisma as never);

      await service.register({
        email: "new@example.fr",
        password: "Str0ng-password!!",
        displayName: "New",
        communityProfileConsent: true,
      } as never);

      const raw = mail.sendEmailVerification.mock.calls[0]?.[1] as string;
      expect(raw).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]?.["token"]).toBe(hashEmailToken(raw));
      expect(rows[0]?.["token"]).not.toBe(raw);
    });

    it("verifies an e-mail from the raw token", async () => {
      const { service, prisma } = build(baseUser);
      const rows = withEmailTokens(prisma as never);
      rows.push({
        id: "t1",
        token: hashEmailToken("raw-token"),
        userId: "user-1",
        type: "verify",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.verifyEmail("raw-token")).resolves.toBeUndefined();
      await expect(service.verifyEmail(hashEmailToken("raw-token"))).rejects.toThrow(/invalid/i);
    });

    it("resets a password from the raw token, never from the stored hash", async () => {
      const { service, prisma } = build(baseUser);
      const rows = withEmailTokens(prisma as never);
      rows.push({
        id: "t1",
        token: hashEmailToken("raw-reset"),
        userId: "user-1",
        type: "reset",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword({ token: hashEmailToken("raw-reset"), password: "New-password-123!" } as never),
      ).rejects.toThrow(/invalide/i);
      await expect(
        service.resetPassword({ token: "raw-reset", password: "New-password-123!" } as never),
      ).resolves.toBeUndefined();
    });
  });

  describe("disableTotp", () => {
    const totpUser: UserRow = { ...baseUser, totpEnabled: true, totpSecret: "enc:SECRET" };

    it("requires the current password", async () => {
      vi.mocked(argon2.verify).mockResolvedValue(false);
      const { service, prisma } = build(totpUser);

      await expect(
        service.disableTotp("user-1", { currentPassword: "wrong", code: "123456" }),
      ).rejects.toThrow(/Mot de passe/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("requires a valid code", async () => {
      totpVerify.mockResolvedValue({ valid: false });
      const { service, prisma } = build(totpUser);

      await expect(
        service.disableTotp("user-1", { currentPassword: "ok", code: "000000" }),
      ).rejects.toThrow(/Invalid TOTP/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("clears the secret and logs the change", async () => {
      const { service, prisma, audit } = build(totpUser);

      await service.disableTotp("user-1", { currentPassword: "ok", code: "123456" });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { totpEnabled: false, totpSecret: null } }),
      );
      expect(audit.log.mock.calls.some((c) => c[0].action === "TOTP_DISABLE")).toBe(true);
    });

    it("refuses when TOTP is not enabled", async () => {
      const { service } = build(baseUser);

      await expect(
        service.disableTotp("user-1", { currentPassword: "ok", code: "123456" }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
