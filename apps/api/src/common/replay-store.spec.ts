import { describe, it, expect, afterEach, vi } from "vitest";
import { MemoryReplayBackend, ReplayStore } from "./replay-store";

/**
 * Anti-replay store.
 *
 * `claimOnce` must succeed exactly once per key within the TTL, and the
 * counters must expire. Both the memory backend and the Redis contract (SET
 * NX EX) are exercised.
 */

function fakeRedis() {
  const keys = new Map<string, string>();
  return {
    keys,
    set: vi.fn(async (key: string, value: string, _m: "EX", _ttl: number, _f: "NX") => {
      if (keys.has(key)) return null;
      keys.set(key, value);
      return "OK";
    }),
    incr: vi.fn(async (key: string) => {
      const next = Number(keys.get(key) ?? "0") + 1;
      keys.set(key, String(next));
      return next;
    }),
    expire: vi.fn(async () => 1),
    get: vi.fn(async (key: string) => keys.get(key) ?? null),
    del: vi.fn(async (key: string) => keys.delete(key)),
  };
}

describe("ReplayStore", () => {
  afterEach(() => vi.useRealTimers());

  it("claims a nonce once with SET NX EX on Redis", async () => {
    const redis = fakeRedis();
    const store = new ReplayStore(redis as never);

    expect(await store.claimOnce("altcha:sig", 600)).toBe(true);
    expect(await store.claimOnce("altcha:sig", 600)).toBe(false);
    expect(redis.set).toHaveBeenCalledWith("altcha:sig", "1", "EX", 600, "NX");
  });

  it("counts within a window and arms the expiry", async () => {
    const redis = fakeRedis();
    const store = new ReplayStore(redis as never);

    expect(await store.increment("fail:u1:ip", 900)).toBe(1);
    expect(await store.increment("fail:u1:ip", 900)).toBe(2);
    expect(await store.count("fail:u1:ip")).toBe(2);
    expect(redis.expire).toHaveBeenCalledWith("fail:u1:ip", 900);

    await store.clear("fail:u1:ip");
    expect(await store.count("fail:u1:ip")).toBe(0);
  });

  it("falls back to memory and honours TTLs", async () => {
    vi.useFakeTimers();
    const store = new ReplayStore(null);

    expect(await store.claimOnce("k", 10)).toBe(true);
    expect(await store.claimOnce("k", 10)).toBe(false);
    vi.advanceTimersByTime(11_000);
    expect(await store.claimOnce("k", 10)).toBe(true);

    await store.increment("c", 5);
    await store.increment("c", 5);
    expect(await store.count("c")).toBe(2);
    vi.advanceTimersByTime(6_000);
    expect(await store.count("c")).toBe(0);
  });

  it("memory backend returns null on a second NX set", async () => {
    const backend = new MemoryReplayBackend();

    expect(await backend.set("a", "1", "EX", 60, "NX")).toBe("OK");
    expect(await backend.set("a", "1", "EX", 60, "NX")).toBeNull();
  });
});
