import type Redis from "ioredis";

/** Injection token for the shared ioredis client (or `null` when REDIS_URL is unset). */
export const REDIS_CLIENT = "REDIS_CLIENT";

export type RedisClient = Redis | null;
