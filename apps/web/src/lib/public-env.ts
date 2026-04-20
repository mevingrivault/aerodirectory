const PRODUCTION_API_BASE = "https://api.navventura.fr/api/v1";
const DEVELOPMENT_API_BASE = "http://localhost:4000/api/v1";

export const API_BASE = resolveApiBase(process.env["NEXT_PUBLIC_API_URL"]);

function resolveApiBase(configuredApiBase: string | undefined): string {
  if (process.env.NODE_ENV !== "production") {
    return trimTrailingSlash(configuredApiBase || DEVELOPMENT_API_BASE);
  }

  if (!configuredApiBase) {
    return PRODUCTION_API_BASE;
  }

  if (configuredApiBase.startsWith("/")) {
    return PRODUCTION_API_BASE;
  }

  try {
    const url = new URL(configuredApiBase);
    const host = url.hostname.toLowerCase();

    if (host === "navventura.fr" || host === "www.navventura.fr" || host === "localhost") {
      return PRODUCTION_API_BASE;
    }

    return trimTrailingSlash(url.toString());
  } catch {
    return PRODUCTION_API_BASE;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
