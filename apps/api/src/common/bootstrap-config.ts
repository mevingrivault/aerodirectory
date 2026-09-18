/**
 * Pure helpers used by main.ts to derive runtime configuration.
 *
 * Kept free of Nest dependencies so they can be unit tested without booting
 * the application.
 */

export interface EnvReader {
  get(key: string, fallback?: string): string | undefined;
}

/**
 * Resolve the Fastify `trustProxy` option.
 *
 * `true` (trust everything) is never returned: it lets a client forge
 * `X-Forwarded-For` and pick the IP that rate limiting, lockout and audit logs
 * rely on. The default is one hop, which matches a single reverse proxy such
 * as Nginx Proxy Manager sitting in front of the API.
 *
 * Accepted values for TRUST_PROXY:
 *  - a positive integer: number of trusted hops
 *  - "false" / "0": trust nothing (direct exposure, development)
 *  - a comma-separated list of IPs/CIDRs: trust exactly those proxies
 */
export type TrustProxySetting = boolean | string[] | TrustProxyHops;

/** Hop-count predicate in the shape proxy-addr expects (`hop` is 0 for the nearest proxy). */
export interface TrustProxyHops {
  (address: string, hop: number): boolean;
  hops: number;
}

function trustHops(hops: number): TrustProxyHops {
  const predicate = ((_address: string, hop: number) => hop < hops) as TrustProxyHops;
  predicate.hops = hops;
  return predicate;
}

export function resolveTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim();
  if (!value) return trustHops(1);

  const lower = value.toLowerCase();
  if (lower === "false" || lower === "0" || lower === "none") return false;
  if (lower === "true") return trustHops(1);

  if (/^\d+$/.test(value)) {
    return trustHops(Math.max(1, Number.parseInt(value, 10)));
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length > 0 ? entries : trustHops(1);
}

export function resolveCorsOrigins(
  env: EnvReader,
  nodeEnv: string | undefined,
): string[] {
  const configuredOrigins = (env.get("CORS_ORIGINS", "") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = new Set(configuredOrigins);
  const appUrl = (env.get("APP_URL", "") ?? "").trim();

  if (appUrl) {
    origins.add(appUrl);
  }

  if (nodeEnv === "production") {
    origins.add("https://navventura.fr");
    origins.add("https://www.navventura.fr");
  } else {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return Array.from(origins);
}

/**
 * Parse a duration such as "15m", "7d", "3600" (seconds) or "3600s" into
 * seconds. Mirrors the subset of the `ms` grammar used by JWT_*_EXPIRES_IN.
 */
export function parseDurationSeconds(raw: string | undefined, fallbackSeconds: number): number {
  const value = raw?.trim();
  if (!value) return fallbackSeconds;

  const match = value.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/i);
  if (!match) return fallbackSeconds;

  const amount = Number.parseFloat(match[1]!);
  const unit = (match[2] ?? "s").toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1 / 1000,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };

  const seconds = Math.round(amount * (multipliers[unit] ?? 1));
  return seconds > 0 ? seconds : fallbackSeconds;
}
