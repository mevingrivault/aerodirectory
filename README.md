# AeroDirectory

Collaborative directory of French aerodromes. Browse airfields, discover pilot services, share experiences, track visited airfields, and plan flights.

## Architecture

```
aerodirectory/
├── apps/
│   ├── api/          # NestJS + Fastify REST API
│   └── web/          # Next.js 15 App Router frontend
├── packages/
│   ├── shared/       # Zod schemas, TypeScript types, constants
│   └── database/     # Prisma schema + client + seed data
├── docker-compose.yml
└── pnpm-workspace.yaml
```

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind, shadcn/ui, MapLibre GL, TanStack Query |
| Backend | NestJS 10 + Fastify, Zod validation, JWT auth |
| Database | PostgreSQL 16 + PostGIS |
| Cache | Redis 7 |
| Storage | S3-compatible (MinIO in dev) |
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

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### Setup

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed sample data
pnpm db:seed

# Start development servers
pnpm dev
```

- API: http://localhost:4000
- Web: http://localhost:3000
- Mailpit: http://localhost:8025
- MinIO Console: http://localhost:9001

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
- `GET /api/v1/aerodromes/:id` — Detail
- `GET /api/v1/aerodromes/icao/:code` — By ICAO code
- `POST /api/v1/aerodromes` — Create (ADMIN/MOD)
- `PUT /api/v1/aerodromes/:id` — Update (ADMIN/MOD)
- `DELETE /api/v1/aerodromes/:id` — Delete (ADMIN)

### Search
- `GET /api/v1/search` — Full-text + filter + geospatial search

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

## License

Code: MIT | User contributions: CC BY-SA 4.0
