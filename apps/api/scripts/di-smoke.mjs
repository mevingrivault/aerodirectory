/**
 * Dependency-injection smoke check, run against the compiled output.
 *
 * Compiling the root module makes Nest scan every module and instantiate
 * every provider, without starting servers or invoking lifecycle hooks (so
 * nothing connects to Postgres, Redis, S3 or SMTP). It catches what unit
 * tests with hand-built services cannot: an undefined provider, a circular
 * file import, a missing module import.
 *
 * It must run on the tsc build (dist/) because decorator metadata is only
 * emitted there; the vitest transform drops it.
 */
import { Test } from "@nestjs/testing";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/navventura_test",
  JWT_SECRET: "di-smoke-jwt-secret-that-is-long-enough-0123456789",
  JWT_REFRESH_SECRET: "di-smoke-refresh-secret-that-is-long-enough-0123456789",
  TOTP_ENCRYPTION_KEY: "di-smoke-totp-encryption-key-0123456789",
  ALTCHA_HMAC_KEY: "di-smoke-altcha-hmac-key",
  CLAMAV_ENABLED: "false",
  SYNC_ENABLED: "false",
  S3_ENDPOINT: "http://localhost:8333",
  S3_REGION: "auto",
});
delete process.env.REDIS_URL;

const { AppModule } = await import("../dist/app.module.js");

const started = Date.now();
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
await moduleRef.close();
console.log(`DI smoke check OK: AppModule compiled in ${Date.now() - started} ms`);
process.exit(0);
