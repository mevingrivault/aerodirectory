import { Inject, Injectable, Logger } from "@nestjs/common";
import { REDIS_CLIENT, type RedisClient } from "./redis.constants";

/**
 * Backend contract: the subset of ioredis used here. Tests pass an in-memory
 * object; production passes the shared client.
 */
export interface ReplayBackend {
  set(key: string, value: string, mode: "EX", ttlSeconds: number, flag: "NX"): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

/**
 * Small anti-replay / short-window counter store.
 *
 * - `claimOnce` marks a nonce as consumed exactly once (captcha solutions,
 *   TOTP codes).
 * - `increment` / `count` / `clear` keep sliding-window counters (failed
 *   login attempts per account and IP).
 *
 * Backed by Redis when REDIS_URL is set; otherwise by process memory, which is
 * only acceptable for development and tests.
 */
@Injectable()
export class ReplayStore {
  private readonly logger = new Logger(ReplayStore.name);
  private readonly backend: ReplayBackend;

  constructor(@Inject(REDIS_CLIENT) redis: RedisClient) {
    if (redis) {
      this.backend = redis;
    } else {
      this.backend = new MemoryReplayBackend();
      this.logger.warn("Anti-rejeu en mémoire — non partagé entre instances.");
    }
  }

  /** Returns true the first time a key is claimed, false on any replay within the TTL. */
  async claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.backend.set(key, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  /** Increments a counter, (re)arming its expiry, and returns the new value. */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.backend.incr(key);
    await this.backend.expire(key, ttlSeconds);
    return value;
  }

  async count(key: string): Promise<number> {
    const raw = await this.backend.get(key);
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  async clear(key: string): Promise<void> {
    await this.backend.del(key);
  }
}

export class MemoryReplayBackend implements ReplayBackend {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  private live(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async set(key: string, value: string, _mode: "EX", ttlSeconds: number, _flag: "NX"): Promise<"OK" | null> {
    if (this.live(key)) return null;
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return "OK";
  }

  async incr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    this.entries.set(key, {
      value: String(next),
      expiresAt: entry?.expiresAt ?? Date.now() + 24 * 3600 * 1000,
    });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.live(key);
    if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
