# Navventura (aerodirectory)

Collaborative directory of French aerodromes. Public repo, **not open source**
(see README). Solo maintainer; production runs from images built by CI.

## Layout

pnpm monorepo (`pnpm-workspace.yaml`):

- `apps/api` — NestJS 11 on Fastify 5, one module per domain in `src/`
  (`auth`, `aerodrome`, `comment`, `photo`, `admin`, `sync`, …). Zod
  validation through `common/zod-validation.pipe.ts`, ioredis, Prisma.
- `apps/web` — Next.js 16 App Router, React 19, Tailwind 4, MapLibre GL 6,
  TanStack Query. API calls go through `src/lib/api-client.ts`. Routes are
  in French (`/membre`, `/cgu`, `/politique-de-confidentialite`).
- `packages/shared` — Zod schemas, types and constants used by both apps.
- `packages/database` — Prisma 7 schema, migrations, seed. The generated
  client lives in `src/generated/` (git-ignored).
- `scripts/` — data imports (openAIP, OpenAir, OSM) and region/flag syncs,
  run with `tsx` from the root `package.json` scripts.

Data flow: openAIP/OSM → import scripts → PostgreSQL/PostGIS → API → web.
Neither app calls openAIP at runtime.

## Toolchain

- Node `>=26.12.1` (`.nvmrc`), pnpm 10 (`packageManager`). Node 26 ships
  without corepack: install pnpm with npm.
- TypeScript 6 everywhere.

## Commands

Build order matters: Prisma client → `shared` → apps.

```bash
pnpm infra:up                     # postgres, redis, seaweedfs, mailpit
pnpm dev                          # generate + build shared + all dev servers
pnpm db:generate                  # after any schema.prisma change
pnpm db:migrate                   # create/apply a migration (dev)
pnpm --filter @aerodirectory/shared build    # after changing shared/
pnpm --filter @aerodirectory/api lint        # = tsc --noEmit
pnpm --filter @aerodirectory/api test        # vitest
pnpm --filter @aerodirectory/api build && pnpm --filter @aerodirectory/api test:di
pnpm --filter @aerodirectory/web build
```

Web on :3000, API on :4000, Mailpit on :8025.

## Before calling a change done

Run what CI runs (`.github/workflows/docker-publish.yml`) for the packages
you touched: API `lint`, `test`, `build`, then `test:di` (it runs on `dist/`
and catches missing providers and module imports that unit tests miss); web
`build`. Only the API has tests; new API behaviour gets a `*.spec.ts` next
to the code.

## Rules

- Aerodromes whose `source` is not `"manual"` are read-only through the API
  (409): the next sync would overwrite any edit. Fix imported data in the
  importer or normalizer instead.
- Never commit `.env*` files except `.env.development` and the `*.example`
  files. `.env.remote.local` points at the production database: don't use
  it to run migrations or seeds.
- Security matters here (OWASP ASVS L2 target, see `AUDIT.md`): don't
  weaken auth, rate limiting, CSP, upload scanning (ClamAV) or ALTCHA
  without saying so explicitly.
- CVE fixes for transitive deps go in `pnpm.overrides` in the root
  `package.json`. Exceptions accepted on purpose go in `.trivyignore`,
  each with a reason.
- `patches/` holds `pnpm patch` files (altcha-lib, @prisma/dev). The
  Dockerfiles copy `patches/` before `pnpm fetch`; keep it that way when
  editing them.
- `apps/web/scripts/copy-altcha.mjs` copies the ALTCHA widget into
  `public/` before `dev` and `build`.
- A push to `main` builds, scans (Trivy) and publishes the `:latest`
  images. Work on a branch and merge when CI-equivalent checks pass.

## Conventions

- Commit messages: English, imperative, sentence case, no prefix,
  describing the outcome ("Keep imported aerodromes read-only through the
  API"). The body explains why.
- Code and identifiers in English; user-facing UI copy and `AUDIT.md` in
  French.
- Major dependency upgrades go on a `feat/<dep>-v<N>` branch, after
  reading the package's changelog or migration guide.

## vexp - Context-Aware AI Coding <!-- vexp v3.3.7 -->

### Context strategy: call run_pipeline ONCE at task start
If the task already names the files/symbols to touch, SKIP vexp. Otherwise one
`run_pipeline({ "task": "..." })` returns ranked pivot files with line ranges and
blast radius. Do NOT open files one by one to find your way around - every extra
tool call costs a turn. Call it again ONLY when the task moves to a new area.
`get_skeleton` for files to understand, not edit. `verify_done` before calling a
multi-file task complete, then RUN the tests it names.

### Query shape (do this)
Anchor the task on real identifiers (ClassName, functionName) or file paths:
`run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`

vexp runs entirely on this machine, index in `.vexp/`;
`run_pipeline` transmits nothing to any external service.
On `status: "degraded"` or 0 pivots the index is still building - use your own tools.
For literal string sweeps use your native search - do NOT route text sweeps through vexp.
Repo SOURCE only: logs, dist/, node_modules/ and files outside the repo are NOT indexed.
<!-- /vexp -->