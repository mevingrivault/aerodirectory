---
name: upgrade-dep
description: Upgrade a dependency across a major version (or a risky minor) in the Navventura monorepo — read its changelog and migration guide, apply the breaking changes, verify like CI, and merge from a feature branch. Use when the user asks to upgrade, bump or migrate a package (e.g. "passe maplibre en v6", "upgrade Prisma"), or when a CVE fix needs a new major.
argument-hint: <package>[@version]
---

# Upgrade a dependency

The package and target come from the arguments (`$ARGUMENTS`). With no
version given, target the latest stable release.

## 1. Scope it

```bash
pnpm why <pkg> -r              # which workspaces use it, directly or not
npm view <pkg> versions --json # available releases
npm view <pkg>@<target> peerDependencies engines
```

Check peer dependencies against what we run: Node 26, TypeScript 6,
React 19, Next 16, NestJS 11, Fastify 5, Prisma 7, Zod 4. If the
upgrade drags in other majors (a Nest plugin needs a new
`@nestjs/core`, for example), list them and upgrade them together.

## 2. Read what changed before touching code

Find the migration guide or CHANGELOG: in the repo on GitHub, or in the
tarball:

```bash
cd <scratchpad> && npm pack <pkg>@<target> && tar -xzf <pkg>-<target>.tgz
```

Look in `package/` for `CHANGELOG.md`, `MIGRATION*.md`, `UPGRADING*.md`.
Also check the package's `exports`, `type` (ESM/CJS) and `main`: CJS/ESM
changes have already broken this repo (altcha-lib v2, fixed with
`patches/`).

Then list every breaking change that affects us, with the files concerned
(search the code for the APIs that were removed or renamed). Show this list
to the user before starting if it's longer than a handful of items.

## 3. Upgrade on a branch

```bash
git switch -c feat/<pkg>-v<major>
pnpm --filter @aerodirectory/<workspace> add <pkg>@^<target>
```

Apply the breaking changes. If the package has a `pnpm patch` in
`patches/`, check whether the new version still needs it. Remove it if
not (`patchedDependencies` in the root `package.json`), otherwise run
`pnpm patch` again for the new version. If the package is copied or
special-cased somewhere (`apps/web/scripts/copy-altcha.mjs`, the altcha
workaround in `apps/api/Dockerfile`), update that too.

## 4. Verify like CI

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @aerodirectory/database build
pnpm --filter @aerodirectory/shared build
pnpm --filter @aerodirectory/api lint
pnpm --filter @aerodirectory/api test
pnpm --filter @aerodirectory/api build
pnpm --filter @aerodirectory/api test:di
pnpm --filter @aerodirectory/web build
```

`test:di` matters for any Nest-side upgrade: it catches providers and
module imports that the unit tests can't see. For a package with runtime
behaviour on the web side (maplibre, altcha, TanStack Query), run the app
with the `run-local` skill and check the affected page, not only the build.

Also scan for vulnerabilities, so the upgrade doesn't trade one problem for
another:

```bash
npx cve-lite-cli@latest . --fail-on high --min-severity high
```

## 5. Commit and merge

Commit on the branch (English, imperative, outcome first), with the
breaking changes handled in the body. Then, once everything above passes:

```bash
git switch main
git merge --no-ff feat/<pkg>-v<major> -m "Merge feat/<pkg>-v<major>: <pkg> ^<old> → ^<new>"
```

Don't push. Report to the user what was migrated, what was checked by
running the app versus only built, and anything left to watch in
production.
