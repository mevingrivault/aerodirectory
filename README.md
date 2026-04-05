# Navventura

Collaborative directory of French aerodromes. Browse airfields, discover pilot services, share experiences, track visited airfields, and plan flights.

## Repository Status

This repository is public on GitHub for transparency, demonstration, and collaboration around the Navventura product.

However, Navventura is **not open source**.

- The source code is publicly visible, but no right is granted to reuse, modify, redistribute, self-host, or create derivative works without prior written permission.
- Repository visibility on GitHub does **not** mean the project is released under an open-source license.
- External contributions, patches, or ideas may be reviewed, but maintainership and publication decisions remain under the control of the project owner.

## Architecture

```
aerodirectory/
├── apps/
│   ├── api/          # NestJS + Fastify REST API
│   │   └── src/services/
│   │       ├── openaip/          # openAIP API client
│   │       ├── importers/openaip/ # openAIP importer + normalizer
│   │       └── airspace/         # OpenAir parser (placeholder)
│   └── web/          # Next.js 15 App Router frontend
├── packages/
│   ├── shared/       # Zod schemas, TypeScript types, constants
│   └── database/     # Prisma schema + client + seed data
├── scripts/
│   ├── setup.mjs     # Automated dev setup
│   └── import-openaip.ts  # openAIP data import CLI
├── docker-compose.yml
└── pnpm-workspace.yaml
```

### Data flow

```
openAIP API  →  import script  →  PostgreSQL  →  NestJS API  →  Next.js frontend
                (pnpm import:openaip)             (our DB)       (reads DB only)
```

The frontend and API **never** call openAIP directly at runtime. All user-facing data comes from our local database.

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind, shadcn/ui, MapLibre GL, TanStack Query |
| Backend | NestJS 10 + Fastify, Zod validation, JWT auth |
| Database | PostgreSQL 16 + PostGIS |
| Data source | openAIP (initial import) |
| Cache | Redis 7 |
| Storage | S3-compatible (SeaweedFS in dev — Apache 2.0) |
| Auth | Argon2id, TOTP (RFC 6238), JWT |

### Security (OWASP ASVS L2)

- Argon2id password hashing (64MB memory, 3 iterations)
- TOTP-based 2FA
- JWT access + refresh tokens (15m / 7d)
- Rate limiting (short / medium / long windows)
- Helmet CSP, CORS, CSRF protection
- SameSite cookies
- Audit logging for all sensitive events
- Zod input validation on all endpoints
- Role-based access control (VISITOR / MEMBER / MODERATOR / ADMIN)
- openAIP API key never exposed to frontend

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### Quick Setup (automatic)

```bash
# Start PostgreSQL
docker compose up -d postgres

# Run the automated setup (installs deps, creates .env files, migrates, seeds)
pnpm install && pnpm setup

# Start development servers
pnpm dev
```

### Manual Setup

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
pnpm install

# Copy environment file and distribute to all packages
# (or just run pnpm setup which does this automatically)
cp .env.development .env
cp .env.development packages/database/.env
cp .env.development apps/api/.env

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed sample data (5 demo aerodromes)
pnpm db:seed

# Start development servers
pnpm dev
```

- API: http://localhost:4000
- Web: http://localhost:3000
- Mailpit: http://localhost:8025
- SeaweedFS S3 API: http://localhost:8333

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `OPENAIP_API_KEY` | openAIP API key for data import | For import only |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | Yes |
| `PORT` | API server port (default 4000) | No |
| `CORS_ORIGINS` | Allowed CORS origins | No |
| `NEXT_PUBLIC_API_URL` | API URL for frontend | Yes |

### Getting an openAIP API Key

1. Sign up at https://www.openaip.net/users/signup
2. Go to your account settings and generate an API key
3. Add it to your `.env` file:
   ```
   OPENAIP_API_KEY=your_openaip_api_key_here
   ```

## Importing Data from openAIP

The openAIP import fetches all French aerodromes and stores them locally.

```bash
# Make sure your .env has OPENAIP_API_KEY set
# Make sure PostgreSQL is running and migrated

pnpm import:openaip
```

### How the sync works

1. Fetches all airports for France from the openAIP API (paginated)
2. Normalizes each airport: trims strings, uppercases ICAO, converts elevation to feet, maps surface/frequency types to our enums
3. Upserts each airport using `source + sourceId` as the unique key
4. Replaces runway and frequency data per airport (inside a transaction)
5. Skips airports whose data hasn't changed (hash comparison)

The import is **idempotent** — running it multiple times is safe and won't create duplicates. Changed records are updated, unchanged records are skipped.

### What is imported

| Field | Source |
|-------|--------|
| Name, ICAO, coordinates, elevation | openAIP airport data |
| Runways (identifier, length, width, surface, lighting) | openAIP runway data |
| Frequencies (type, MHz, callsign) | openAIP frequency data |
| Airport type (small, international, glider, etc.) | openAIP type code |

## Database Entities

| Table | Description |
|-------|-------------|
| `aerodromes` | Core aerodrome data with source tracking |
| `runways` | Runway details per aerodrome |
| `frequencies` | Radio frequencies per aerodrome |
| `fuels` | Fuel availability per aerodrome |
| `airspaces` | Airspace data (future — table exists, no data yet) |
| `users` | User accounts with auth |
| `visits` | User visit tracking (Pokédex) |
| `comments` | User comments on aerodromes |
| `corrections` | Data correction proposals |
| `reports` | Content reports |
| `aircraft_profiles` | Flight planner profiles |
| `audit_logs` | Security audit trail |

## Pages & Features

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page |
| Search | `/search` | Search & filter aerodromes, nearby discovery |
| Map | `/map` | Interactive map with color-coded markers by type |
| Detail | `/aerodrome/[id]` | Full aerodrome info, runways, frequencies, nearby |
| Pokédex | `/pokedex` | Pilot logbook & badges |
| Planner | `/planner` | Flight planner with aircraft profiles |
| Login | `/login` | Authentication |
| Register | `/register` | Account creation |
| Profile | `/profile` | User profile & 2FA setup |

## API Endpoints

### Auth
- `POST /api/v1/auth/register` — Register
- `POST /api/v1/auth/login` — Login
- `POST /api/v1/auth/login/totp` — Complete TOTP step
- `POST /api/v1/auth/refresh` — Refresh tokens
- `GET /api/v1/auth/verify-email?token=` — Verify email
- `POST /api/v1/auth/totp/setup` — Setup TOTP
- `POST /api/v1/auth/totp/verify` — Enable TOTP
- `GET /api/v1/auth/profile` — Get profile

### Aerodromes
- `GET /api/v1/aerodromes` — List (paginated)
- `GET /api/v1/aerodromes/nearby?lat=&lng=&radiusKm=` — Nearby search
- `GET /api/v1/aerodromes/:id` — Detail
- `GET /api/v1/aerodromes/icao/:code` — By ICAO code
- `POST /api/v1/aerodromes` — Create (ADMIN/MOD)
- `PUT /api/v1/aerodromes/:id` — Update (ADMIN/MOD)
- `DELETE /api/v1/aerodromes/:id` — Delete (ADMIN)

### Search
- `GET /api/v1/search` — Full-text + filter + geospatial search
  - `q` — free text (name, ICAO, city)
  - `aerodromeType` — filter by type
  - `lat`, `lng`, `radiusKm` — geospatial filter
  - `sortBy` — name, distance, icaoCode, city
  - `hasRestaurant`, `nightOperations`, `fuel`, `surface`, `minRunwayLength`

### Visits (Pokédex)
- `GET /api/v1/visits` — My visits
- `GET /api/v1/visits/stats` — Pokédex stats & badges
- `PUT /api/v1/visits/:aerodromeId` — Mark visit
- `DELETE /api/v1/visits/:aerodromeId` — Remove visit

### Comments & Corrections
- `GET /api/v1/aerodromes/:id/comments` — List comments
- `POST /api/v1/aerodromes/:id/comments` — Add comment
- `DELETE /api/v1/aerodromes/:id/comments/:commentId` — Delete
- `POST /api/v1/aerodromes/:id/corrections` — Propose correction
- `POST /api/v1/aerodromes/:id/reports` — Report content

### Flight Planner
- `GET /api/v1/planner/profiles` — My aircraft profiles
- `POST /api/v1/planner/profiles` — Create profile
- `PUT /api/v1/planner/profiles/:id` — Update profile
- `DELETE /api/v1/planner/profiles/:id` — Delete profile
- `POST /api/v1/planner/calculate` — Calculate reachable aerodromes

### Health
- `GET /api/v1/health` — Health check

## Out of Scope (this iteration)

- SIA ingestion
- OurAirports ingestion
- Multi-source data reconciliation
- Airspace import (table exists, parser placeholder ready)
- NOTAM / weather integration
- Advanced collaborative editing
- Photo uploads
- Admin backoffice

## References

- [openAIP API Documentation](https://www.openaip.net/docs)
- [OpenAir File Format](https://github.com/naviter/seeyou_file_formats/blob/main/OpenAir_File_Format_Support.md)

## License

Navventura is a public-source-available project hosted on GitHub, but it is **not open source**.

- Source code: all rights reserved unless explicit written permission is granted by the project owner.
- User-generated content and community contributions published through the product may be subject to separate terms defined by the platform.

If you want to reuse part of the codebase, deploy it, adapt it, or integrate it into another project, request authorization first.
