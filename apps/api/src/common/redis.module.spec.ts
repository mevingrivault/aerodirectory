import { describe, it, expect } from "vitest";
import { RedisModule } from "./redis.module";
import { ReplayStore } from "./replay-store";
import { RefreshTokenStore } from "../auth/refresh-token.store";

/**
 * Module wiring.
 *
 * A circular file import between redis.module.ts and replay-store.ts once
 * left the ReplayStore provider `undefined` at decoration time, which Nest
 * reports as a circular dependency and refuses to boot. The unit tests never
 * load the module, so this one reads the decorator metadata directly.
 */
describe("RedisModule", () => {
  it("declares every provider as a defined class or factory", () => {
    const providers = Reflect.getMetadata("providers", RedisModule) as unknown[];

    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(provider).toBeDefined();
    }
    expect(providers).toContain(ReplayStore);
  });

  it("exports the client token and the replay store", () => {
    const exported = Reflect.getMetadata("exports", RedisModule) as unknown[];

    expect(exported).toContain("REDIS_CLIENT");
    expect(exported).toContain(ReplayStore);
  });

  it("keeps the stores importable without pulling the module in", () => {
    expect(typeof ReplayStore).toBe("function");
    expect(typeof RefreshTokenStore).toBe("function");
  });
});
