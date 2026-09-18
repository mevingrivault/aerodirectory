import { describe, it, expect, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { IS_PUBLIC_KEY } from "../../common/decorators";

/**
 * Access token gate.
 *
 * Beyond signature and expiry (delegated to JwtService), the guard must refuse
 * the tokens that are signed with the same secret but are not sessions: the
 * partial TOTP token and the refresh token. It must also honour revocation
 * through tokenVersion and bans.
 */

type DbUser = { id: string; role: string; status: string; tokenVersion: number } | null;

function build(opts: {
  isPublic?: boolean;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  payload?: Record<string, unknown> | Error;
  dbUser?: DbUser;
}) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => (key === IS_PUBLIC_KEY ? opts.isPublic : undefined)),
  };
  const jwt = {
    verifyAsync: vi.fn(async () => {
      if (opts.payload instanceof Error) throw opts.payload;
      return opts.payload ?? {};
    }),
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(opts.dbUser ?? null) },
  };
  const request: Record<string, unknown> = {
    headers: opts.headers ?? {},
    cookies: opts.cookies ?? {},
  };
  const context = {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  };

  const guard = new JwtAuthGuard(jwt as never, reflector as never, prisma as never);
  return { guard, context: context as never, request, jwt, prisma };
}

const activeUser: DbUser = { id: "u1", role: "MEMBER", status: "ACTIVE", tokenVersion: 3 };

describe("JwtAuthGuard", () => {
  it("lets public routes through without a token", async () => {
    const { guard, context, jwt } = build({ isPublic: true });

    expect(await guard.canActivate(context)).toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it("refuses a request with no token", async () => {
    const { guard, context } = build({});

    await expect(guard.canActivate(context)).rejects.toThrow("Missing authentication token");
  });

  it("accepts the access_token cookie and attaches the database role", async () => {
    const { guard, context, request } = build({
      cookies: { access_token: "tok" },
      payload: { sub: "u1", role: "ADMIN", ver: 3 },
      dbUser: activeUser,
    });

    expect(await guard.canActivate(context)).toBe(true);
    expect((request["user"] as { role: string }).role).toBe("MEMBER");
  });

  it("accepts a Bearer header when there is no cookie", async () => {
    const { guard, context, jwt } = build({
      headers: { authorization: "Bearer abc" },
      payload: { sub: "u1", role: "MEMBER", ver: 3 },
      dbUser: activeUser,
    });

    expect(await guard.canActivate(context)).toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith("abc");
  });

  it("refuses an invalid or expired signature", async () => {
    const { guard, context } = build({
      cookies: { access_token: "tok" },
      payload: new Error("jwt expired"),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("refuses the partial TOTP token as a session", async () => {
    const { guard, context, prisma } = build({
      cookies: { access_token: "tok" },
      payload: { sub: "u1", role: "MEMBER", ver: 3, typ: "totp", totpPending: true },
      dbUser: activeUser,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a refresh token used as an access token", async () => {
    const { guard, context } = build({
      cookies: { access_token: "tok" },
      payload: { sub: "u1", role: "MEMBER", ver: 3, typ: "refresh", jti: "x" },
      dbUser: activeUser,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("refuses a token whose version was revoked", async () => {
    const { guard, context } = build({
      cookies: { access_token: "tok" },
      payload: { sub: "u1", role: "MEMBER", ver: 2 },
      dbUser: activeUser,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(/révoquée/i);
  });

  it("refuses a legacy token issued without a version", async () => {
    const { guard, context } = build({
      cookies: { access_token: "tok" },
      payload: { sub: "u1", role: "MEMBER" },
      dbUser: activeUser,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("refuses a banned user even with a valid token", async () => {
    const { guard, context } = build({
      cookies: { access_token: "tok" },
      payload: { sub: "u1", role: "MEMBER", ver: 3 },
      dbUser: { ...activeUser, status: "BANNED" },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(/suspendu/i);
  });

  it("refuses a token for a deleted account", async () => {
    const { guard, context } = build({
      cookies: { access_token: "tok" },
      payload: { sub: "gone", role: "MEMBER", ver: 0 },
      dbUser: null,
    });

    await expect(guard.canActivate(context)).rejects.toThrow("Account not found");
  });
});
