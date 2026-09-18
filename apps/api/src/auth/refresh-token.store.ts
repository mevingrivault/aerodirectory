import { Inject, Injectable, Logger } from "@nestjs/common";
import { REDIS_CLIENT, type RedisClient } from "../common/redis.module";

/**
 * Minimal key/value contract the store needs. ioredis satisfies it; tests use
 * an in-memory object.
 */
export interface RefreshTokenBackend {
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

/**
 * Server-side registry of issued refresh tokens.
 *
 * A refresh token is only honoured while its `jti` is present here, and it is
 * removed atomically when consumed, so each refresh token can be used exactly
 * once (rotation) and `logout` can revoke a session for real instead of just
 * clearing cookies.
 *
 * Without Redis the registry lives in process memory: fine for development
 * and tests, not for a multi-instance deployment (a warning is logged).
 */
@Injectable()
export class RefreshTokenStore {
  private readonly logger = new Logger(RefreshTokenStore.name);
  private readonly backend: RefreshTokenBackend;

  constructor(@Inject(REDIS_CLIENT) redis: RedisClient) {
    if (redis) {
      this.backend = redis;
    } else {
      this.backend = new MemoryBackend();
      this.logger.warn("Refresh tokens stockés en mémoire — non partagé entre instances.");
    }
  }

  static key(userId: string, jti: string): string {
    return `session:refresh:${userId}:${jti}`;
  }

  async save(userId: string, jti: string, ttlSeconds: number): Promise<void> {
    await this.backend.set(RefreshTokenStore.key(userId, jti), "1", "EX", ttlSeconds);
  }

  /**
   * Atomically check and remove a refresh token. Returns `false` when the
   * token was never issued, already used, expired or revoked.
   */
  async consume(userId: string, jti: string): Promise<boolean> {
    const value = await this.backend.getdel(RefreshTokenStore.key(userId, jti));
    return value !== null;
  }

  async revoke(userId: string, jti: string): Promise<void> {
    await this.backend.del(RefreshTokenStore.key(userId, jti));
  }
}

class MemoryBackend implements RefreshTokenBackend {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, _mode: "EX", ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async getdel(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
