import { describe, it, expect } from "vitest";
import {
  parseDurationSeconds,
  resolveCorsOrigins,
  resolveTrustProxy,
} from "./bootstrap-config";

/**
 * Proxy trust.
 *
 * Rate limiting, account lockout and audit logs all key on `req.ip`. With
 * `trustProxy: true`, a client can forge X-Forwarded-For and pick that IP, so
 * the helper must never return `true` whatever the configuration says.
 */
function hops(setting: ReturnType<typeof resolveTrustProxy>): number | null {
  return typeof setting === "function" ? setting.hops : null;
}

describe("resolveTrustProxy", () => {
  it("defaults to a single trusted hop", () => {
    expect(hops(resolveTrustProxy(undefined))).toBe(1);
    expect(hops(resolveTrustProxy(""))).toBe(1);
  });

  it("trusts only the nearest proxy by default", () => {
    const setting = resolveTrustProxy(undefined);
    if (typeof setting !== "function") throw new Error("expected a hop predicate");

    expect(setting("10.0.0.1", 0)).toBe(true); // the reverse proxy
    expect(setting("203.0.113.9", 1)).toBe(false); // whatever the client put in X-Forwarded-For
  });

  it("never returns true, even when asked to", () => {
    expect(resolveTrustProxy("true")).not.toBe(true);
    expect(hops(resolveTrustProxy("true"))).toBe(1);
  });

  it("accepts a hop count", () => {
    expect(hops(resolveTrustProxy("2"))).toBe(2);
  });

  it("refuses zero hops as a count but allows disabling explicitly", () => {
    expect(resolveTrustProxy("0")).toBe(false);
    expect(resolveTrustProxy("false")).toBe(false);
  });

  it("accepts a list of proxy addresses", () => {
    expect(resolveTrustProxy("10.0.0.1, 172.18.0.0/16")).toEqual([
      "10.0.0.1",
      "172.18.0.0/16",
    ]);
  });
});

describe("resolveCorsOrigins", () => {
  const env = (values: Record<string, string>) => ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  });

  it("adds the production domains in production", () => {
    const origins = resolveCorsOrigins(env({ CORS_ORIGINS: "https://app.example" }), "production");

    expect(origins).toContain("https://app.example");
    expect(origins).toContain("https://navventura.fr");
    expect(origins).not.toContain("http://localhost:3000");
  });

  it("adds localhost outside production and de-duplicates", () => {
    const origins = resolveCorsOrigins(
      env({ CORS_ORIGINS: "http://localhost:3000", APP_URL: "http://localhost:3000" }),
      "development",
    );

    expect(origins.filter((o) => o === "http://localhost:3000")).toHaveLength(1);
  });
});

describe("parseDurationSeconds", () => {
  it("parses the units used for token lifetimes", () => {
    expect(parseDurationSeconds("15m", 1)).toBe(900);
    expect(parseDurationSeconds("7d", 1)).toBe(604800);
    expect(parseDurationSeconds("1h", 1)).toBe(3600);
    expect(parseDurationSeconds("30", 1)).toBe(30);
  });

  it("falls back on garbage", () => {
    expect(parseDurationSeconds("soon", 42)).toBe(42);
    expect(parseDurationSeconds(undefined, 42)).toBe(42);
    expect(parseDurationSeconds("0d", 42)).toBe(42);
  });
});
