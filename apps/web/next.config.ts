import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/** Origin of the API, so a local API on another port is allowed in development. */
function apiOrigin(): string | null {
  const raw = process.env["NEXT_PUBLIC_API_URL"];
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Content Security Policy.
 *
 * Pages are statically prerendered, so a per-request nonce is not available
 * and Next.js' own hydration scripts need 'unsafe-inline' for script-src.
 * Everything else is locked down: scripts only from this origin, network and
 * images only to this origin and the map tile providers, no plugins, no
 * framing, forms only to this origin. Map and captcha workers run from blob
 * URLs.
 */
function contentSecurityPolicy(): string {
  const self = "'self'";
  const api = apiOrigin();
  const tileHosts = [
    "https://tile.openstreetmap.org",
    "https://*.tile.openstreetmap.org",
    "https://server.arcgisonline.com",
  ];
  const connect = [self, ...(api ? [api] : []), ...tileHosts];

  const directives = [
    `default-src ${self}`,
    `script-src ${self} 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    `style-src ${self} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src ${self} https://fonts.gstatic.com data:`,
    `img-src ${self} data: blob: ${tileHosts.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
    `worker-src ${self} blob:`,
    `child-src ${self} blob:`,
    `object-src 'none'`,
    `base-uri ${self}`,
    `form-action ${self}`,
    `frame-ancestors 'none'`,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@aerodirectory/shared"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
