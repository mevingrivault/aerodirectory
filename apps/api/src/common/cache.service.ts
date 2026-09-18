import { Inject, Injectable, Logger } from "@nestjs/common";
import { REDIS_CLIENT, type RedisClient } from "./redis.constants";

/**
 * JSON cache on the shared Redis client, with an in-process fallback used
 * when Redis is not configured or momentarily unreachable.
 *
 * Every service that used to open its own ioredis connection goes through
 * this one instead.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly memory = new Map<string, { value: unknown; expiresAt: number }>();
  private static readonly MEMORY_MAX_ENTRIES = 5_000;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw !== null) return JSON.parse(raw) as T;
        return null;
      } catch (error) {
        this.logger.warn(`Lecture cache Redis échouée (${key}) : ${(error as Error).message}`);
      }
    }

    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
        return;
      } catch (error) {
        this.logger.warn(`Écriture cache Redis échouée (${key}) : ${(error as Error).message}`);
      }
    }

    if (this.memory.size >= CacheService.MEMORY_MAX_ENTRIES) {
      this.pruneMemory();
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async getOrSet<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await produce();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async delete(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        this.logger.warn(`Suppression cache Redis échouée (${key}) : ${(error as Error).message}`);
      }
    }
    this.memory.delete(key);
  }

  private pruneMemory() {
    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (entry.expiresAt <= now) this.memory.delete(key);
    }
    if (this.memory.size >= CacheService.MEMORY_MAX_ENTRIES) {
      // Still full of live entries: drop the oldest inserted half.
      const keys = Array.from(this.memory.keys()).slice(0, Math.floor(this.memory.size / 2));
      for (const key of keys) this.memory.delete(key);
    }
  }
}
