import { describe, it, expect, vi, afterEach } from "vitest";
import { RefreshTokenStore, type RefreshTokenBackend } from "./refresh-token.store";

/**
 * Refresh token registry.
 *
 * The property that matters: a token is usable exactly once. The second
 * `consume` of the same jti must fail, whichever backend is behind the store.
 */

function fakeRedis(): RefreshTokenBackend & { keys: Map<string, string> } {
  const keys = new Map<string, string>();
  return {
    keys,
    set: vi.fn(async (key: string, value: string) => {
      keys.set(key, value);
      return "OK";
    }),
    getdel: vi.fn(async (key: string) => {
      const value = keys.get(key) ?? null;
      keys.delete(key);
      return value;
    }),
    del: vi.fn(async (key: string) => {
      keys.delete(key);
      return 1;
    }),
  };
}

describe("RefreshTokenStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("consumes a saved token exactly once (Redis backend)", async () => {
    const redis = fakeRedis();
    const store = new RefreshTokenStore(redis as never);

    await store.save("user-1", "jti-1", 60);
    expect(redis.set).toHaveBeenCalledWith(
      "session:refresh:user-1:jti-1",
      "1",
      "EX",
      60,
    );

    expect(await store.consume("user-1", "jti-1")).toBe(true);
    expect(await store.consume("user-1", "jti-1")).toBe(false);
  });

  it("refuses a token that was never issued", async () => {
    const store = new RefreshTokenStore(fakeRedis() as never);

    expect(await store.consume("user-1", "unknown")).toBe(false);
  });

  it("refuses a revoked token", async () => {
    const store = new RefreshTokenStore(fakeRedis() as never);

    await store.save("user-1", "jti-1", 60);
    await store.revoke("user-1", "jti-1");

    expect(await store.consume("user-1", "jti-1")).toBe(false);
  });

  it("scopes tokens by user", async () => {
    const store = new RefreshTokenStore(fakeRedis() as never);

    await store.save("user-1", "jti-1", 60);

    expect(await store.consume("user-2", "jti-1")).toBe(false);
    expect(await store.consume("user-1", "jti-1")).toBe(true);
  });

  it("falls back to memory without Redis and honours the TTL", async () => {
    vi.useFakeTimers();
    const store = new RefreshTokenStore(null);

    await store.save("user-1", "jti-1", 10);
    vi.advanceTimersByTime(11_000);

    expect(await store.consume("user-1", "jti-1")).toBe(false);
  });
});
