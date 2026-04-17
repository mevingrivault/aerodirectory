import "dotenv/config";
import { defineConfig } from "prisma/config";

const FALLBACK_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/aerodirectory?schema=public";

const databaseUrl = process.env["DATABASE_URL"] ?? FALLBACK_DATABASE_URL;

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  migrate: {
    adapter: async () => {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: databaseUrl });
      return new PrismaPg(pool);
    },
  },
  datasource: {
    url: databaseUrl,
  },
});
