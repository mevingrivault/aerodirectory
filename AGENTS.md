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
- `scripts/` — the same imports run by hand with `tsx`, **local only**
  (`run-imports.sh` included).

## Data sources

Imports live in `apps/api/src/services/importers/<source>/` and run as
sources of the sync worker (`apps/api/src/sync/`: cron, retries, admin
trigger at `POST /admin/sync/:source`). In production Postgres and S3 sit on
the internal Docker network: an import that is not a sync source cannot run
there.

| Sync source | What | Licence |
|---|---|---|
| `OPENAIP` | aerodromes, runways, frequencies, fuel, phones, hours | CC BY-NC |
| `AIRSPACES`, `OBSTACLES` | airspaces; wind turbines, towers… | CC BY-NC |
| `OSM` | restaurants, transport, lodging around fields | ODbL |
| `REGIONS` | city/region via Nominatim | ODbL |
| `OURAIRPORTS` | `websiteUrl`, `wikipediaUrl` | public domain |
| `COMMONS` | one photo per aerodrome (Wikidata P18), copied to S3 | per file, credited |
| `PROTECTED_AREAS`, `AERIAL_LINES` | BD TOPO via Géoplateforme WFS (`ign/wfs.ts`) | Licence Ouverte |
| `WIND_CLIMATE` | wind rose per Météo-France station, 2020-2024 | Licence Ouverte |
| `CAM_AERO` | webcam links per field from cam-aero.eu (links only, no images) | no licence stated: links only |

Fuel prices, fees, hangars and member webcam links are not imported: members
propose them (`community-info/`, moderated, dated) and the sheet shows the
newest approved entry per kind and key.

Runtime calls to outside services: CheckWX (METAR/TAF, `metar/`) and HEAD
requests to the SIA for the current AIRAC cycle's VAC/AD 2 (`sia/`), both
cached and with timeouts. Nothing else is fetched at request time, and
browsers load nothing from third parties except map tiles (CSP).

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
- Migrations are applied in production by `apps/api/docker/migrate.mjs`
  (each `migration.sql` in one go, no Prisma CLI), in the `migrate` service
  before the API starts. Write them by hand from
  `prisma migrate diff --from-schema <old> --to-schema prisma/schema.prisma --script`,
  with `"public".` names and `IF NOT EXISTS` where possible. `ALTER TYPE …
  ADD VALUE` is fine as long as the same file does not use the new value.
- Text from openAIP, OSM, Nominatim or Wikimedia is user-editable upstream:
  never put it in HTML strings (MapLibre `setHTML`, `innerHTML`); build DOM
  nodes (`apps/web/src/lib/map-popup.ts`). The CSP allows inline scripts.
- Bulk imports rebuild their table in one transaction and throw instead of
  writing when the answer looks truncated (minimum count), so a bad run
  keeps the previous data. A failed external call is never cached.
- The openAIP change-detection hash includes `NORMALIZER_VERSION`
  (`openaip.normalizer.ts`): bump it when the normalizer reads a new field,
  or existing aerodromes never get it.
- The checkout tends to grow macOS-style `name 2.ext` copies of recently
  written files (folder sync). Stage explicit paths, and run
  `find . -name "* 2.*" -not -path "*/node_modules/*"` before committing.
- A push to `main` builds, scans (Trivy) and publishes the `:latest`
  images, unless it only touches Markdown or `.claude/`, `.codex/`, `.vexp/`
  (`paths-ignore`). Work on a branch and merge when CI-equivalent checks
  pass. Dependabot proposes GitHub Actions bumps; npm deps are upgraded by
  hand.

## Conventions

- Commit messages: English, imperative, sentence case, no prefix,
  describing the outcome ("Keep imported aerodromes read-only through the
  API"). The body explains why.
- Code and identifiers in English; user-facing UI copy and `AUDIT.md` in
  French.
- Major dependency upgrades go on a `feat/<dep>-v<N>` branch, after
  reading the package's changelog or migration guide.

## vexp - Context-Aware AI Coding <!-- vexp v3.3.8 -->

### Context strategy: call run_pipeline ONCE at task start
If the task already names the files/symbols to touch, skip run_pipeline. Otherwise one
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