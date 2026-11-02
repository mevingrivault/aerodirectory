---
name: run-local
description: Start Navventura locally (infra in Docker, API on :4000, web on :3000) and check that a change actually works in the running app. Use when asked to run, start or test the app, to check a page or endpoint, or after a change to the web or API that a build alone can't validate.
---

# Run Navventura locally

## 1. Infra

Docker has to be running (`docker info`). If it isn't, ask the user to
start Docker Desktop. Don't try to install anything.

```bash
pnpm infra:up      # postgres :5432, redis :6379, seaweedfs (S3 :8333), mailpit :8025
```

ClamAV is not part of `infra:up`, and `CLAMAV_ENABLED=false` in dev. Only
for upload or scanning work: `docker compose up -d clamav` and
`CLAMAV_ENABLED=true` in `apps/api/.env`.

## 2. First run only

If `apps/api/.env` or `apps/web/.env.local` is missing, or the database is
empty:

```bash
pnpm setup         # copies .env.development everywhere, installs, migrates, seeds
```

**Never** run `pnpm setup:remote` or use `.env.remote.local` without the
user asking for it: it points the local app at the production database.

After a `schema.prisma` change: `pnpm db:migrate`. After a change in
`packages/shared`: `pnpm dev` rebuilds it at startup.

## 3. Start the servers

Check that the ports are free (`lsof -iTCP -sTCP:LISTEN -P | grep -E ':(3000|4000)'`);
if the user already has `pnpm dev` running, reuse it.

Otherwise start it in the background and wait until it's ready:

```bash
pnpm dev           # run_in_background
```

Ready when both answer:

```bash
curl -fsS http://localhost:4000/api/v1/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

## 4. Check the change

- **API**: call the endpoints under `http://localhost:4000/api/v1/…`
  with `curl`, using the payloads from `packages/shared/src/schemas`.
  Authenticated routes need a session: sign up through the API (the
  verification email lands in Mailpit, http://localhost:8025), and use
  `pnpm admin:promote -- <email>` for admin routes. Sign-up and login
  need an ALTCHA solution, so for those flows a browser is simpler.
- **Web**: if a browser tool is available (Claude in Chrome or the
  built-in browser), open http://localhost:3000 on the page concerned,
  click through the flow, and check the console. The seed provides 5
  demo aerodromes (LFPB, LFPN, LFLY, LFCH, …) for the map, search and
  aerodrome pages. Without a browser, say what couldn't be checked
  instead of claiming it works.
- **Imported data** (obstacles, protected areas, aerial lines, wind rose,
  Commons photos…): the seed has none. Imports are sync sources and the
  local API runs without the worker, so a run triggered from the admin
  page stays queued. Set `SYNC_ENABLED=true` in `apps/api/.env`, restart,
  then trigger the source from `/admin`. Mind the volumes: `OSM` downloads
  ~4 GB, `WIND_CLIMATE` ~2.8 GB, `COMMONS` one file per photo; the IGN
  sources take seconds.

## 5. Clean up

Stop the `pnpm dev` you started (not one the user had running). Leave the
infra containers running unless the user asks for `pnpm infra:down`.
Report what was checked in the running app and what was only built.
