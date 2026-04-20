export const API_BASE =
  process.env["NEXT_PUBLIC_API_URL"] ||
  (process.env.NODE_ENV === "production"
    ? "https://api.navventura.fr/api/v1"
    : "http://localhost:4000/api/v1");
