import { describe, it, expect, vi } from "vitest";
import { RolesGuard } from "./roles.guard";
import { ROLES_KEY, IS_PUBLIC_KEY } from "../../common/decorators";

/**
 * Role-based access control.
 *
 * This guard is the gate in front of every admin and moderation route, so the
 * cases that matter most are the refusals: an unauthenticated caller, a member
 * reaching for an admin route, and a role that simply is not on the list.
 */

type GuardCase = {
  isPublic?: boolean;
  requiredRoles?: string[];
  user?: { role?: string } | null;
};

function buildContext({ isPublic, requiredRoles, user }: GuardCase) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === ROLES_KEY) return requiredRoles;
      return undefined;
    }),
  };

  const context = {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  };

  return { guard: new RolesGuard(reflector as never), context: context as never };
}

describe("RolesGuard", () => {
  it("lets anyone through a route marked public", () => {
    const { guard, context } = buildContext({ isPublic: true, user: null });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("lets any signed-in user through a route with no role requirement", () => {
    const { guard, context } = buildContext({ user: { role: "MEMBER" } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("refuses an unauthenticated caller on a protected route", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["ADMIN"],
      user: null,
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it("refuses a caller whose token carries no role", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["ADMIN"],
      user: {},
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it("refuses a plain member reaching for an admin route", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["ADMIN"],
      user: { role: "MEMBER" },
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it("refuses a moderator on an admin-only route", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["ADMIN"],
      user: { role: "MODERATOR" },
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it("admits an admin on an admin route", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["ADMIN"],
      user: { role: "ADMIN" },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("admits a moderator on a route open to moderators and admins", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["MODERATOR", "ADMIN"],
      user: { role: "MODERATOR" },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("refuses a visitor on a route open to moderators and admins", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["MODERATOR", "ADMIN"],
      user: { role: "VISITOR" },
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it("does not treat an unknown role as privileged", () => {
    const { guard, context } = buildContext({
      requiredRoles: ["ADMIN"],
      user: { role: "SUPERUSER" },
    });

    expect(guard.canActivate(context)).toBe(false);
  });
});
