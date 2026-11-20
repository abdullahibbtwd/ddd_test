# Decisions (Tasks 1–9)

One line of reasoning each. Newest themes last.

## Tooling / monorepo

- **pnpm `minimumReleaseAge: 10080` (7 days)** — reduce supply-chain risk from brand-new publishes; pins/overrides when a needed version is still too young.
- **Package pins via `pnpm-workspace.yaml` `overrides`** — keep Nest, BullMQ, AWS SDK, Turbo, etc. on known-good versions when the age gate or peer ranges would otherwise float.
- **`trustPolicy: off`** — pnpm 12 trust prompts would block non-interactive CI/Docker installs.
- **`allowBuilds` for esbuild / prisma / `@swc/core` / …** — only approve build scripts we actually need.
- **Turbo for scripts** — cacheable `build` / `lint` / `typecheck` / `test` across `apps/*` and `packages/*`.
- **Node 24 (`.nvmrc`) + pnpm 12.10.1** — current LTS line and the repo `packageManager` field.
- **nestjs-zod peer override (`allowedVersions` for Nest 12)** — nestjs-zod peers lagged Nest 12; allow the install without downgrading Nest.
- **Prisma 7.10.1 instead of the 8 RC** — stay on a stable major for migrate/client/docker; Prisma 8 was still release-candidate when chosen.

## API / worker

- **Single `apps/api` codebase, two entry points** — share config, Prisma, queues, and future domain services; avoid a second package.
- **`ProcessorsModule` only in the worker** — HTTP process enqueues; only `worker.js` consumes (no double-processing).
- **BullMQ `jobId` parts joined with `_`** — BullMQ treats `:` specially in custom job ids; reject empty parts and `:`.
- **Helmet CORP `cross-origin` only when `NODE_ENV=development`** — Vite and API are different origins in dev; production is same-origin behind Caddy (Helmet default `same-origin`).
- **Swagger and `/api/dev/*` off in production** — OpenAPI UI is non-prod; smoke controllers register only when `NODE_ENV=development`.
- **Bull Board behind basic auth** — replaced in Task 9 by admin session + CASL at `/api/admin/queues` (see Users / areas).
- **`prisma` is a runtime dependency** — production image must run `prisma migrate deploy` (Prisma 7 reads URL from `prisma.config.ts`).

## Data / files / mail / PDF

- **UUID v7 generated in the app** — time-sortable ids without DB-side `gen_random_uuid` defaults for PKs.
- **Soft deletes + `NUMERIC(12,2)` money** — no hard deletes for business rows; never float money.
- **Extensions `pg_trgm` / `unaccent` / `pgcrypto` in the first migration** — Cyrillic fuzzy search and crypto helpers from day one.
- **Garage private bucket only** — serve via API or short-lived presigned URLs.
- **Garage healthcheck via `garage status`** — S3 port alone is a weak signal; CLI status matches how we operate the node.
- **PDF fonts embedded as base64 woff2** — Gotenberg/Chromium must render Bulgarian without host fonts.
- **Gotenberg footer limitation** — Chromium header/footer templates are constrained; keep footers simple / documented in FILES-PDF-MAIL.
- **Mail: API enqueues only** — SMTP lives in the worker; never put file bytes in Redis payloads.
- **Gotenberg `mem_limit: 1g` in prod compose** — Chromium can spike RAM; cap to protect the host.

## Web

- **`@ddcrm/shared` aliased to source in the Vite build** — avoid requiring a shared `dist` build for every web/dev/test run; CJS `dist` also tree-shakes poorly.
- **PWA app-shell only (`runtimeCaching: []`)** — never cache API/data; `navigateFallbackDenylist` for `/api/*` and `/admin/*` so those navigations hit the server.
- **Self-hosted `@fontsource-variable` Inter + JetBrains Mono (Cyrillic)** — no CDN font requests.
- **Orval client + custom `apiFetch` mutator** — typed hooks with shared `ApiError` mapping and `credentials: "include"` ready for Phase 1 sessions.
- **Vite proxies `/api` and `/admin` to the API; `VITE_API_URL` empty** — same-origin in dev and prod. OpenAPI paths already include `/api`, so the base URL must be empty (not `/api`) to avoid `/api/api/...`. (Task text said `VITE_API_URL=/api`; that would double-prefix Orval paths.)
- **Removed Helmet CORP `cross-origin` exception** — with the Vite proxy the SPA is same-origin; default CORP is fine. CORS stays for OriginGuard allowlists and residual direct API access.
- **Playwright sets `E2E=1` on the API process** — skips Nest throttling so login `5/min` does not flake e2e; production throttle unchanged.
- **httpOnly cookies for access + refresh; never localStorage** — XSS cannot read tokens; refresh path narrowed to `/api/auth`.
- **`@nestjs/jwt` + custom `JwtAuthGuard` (no Passport)** — Fastify does not benefit from Passport adapters; verify with `algorithms: ['HS256']` only.
- **Argon2id via `argon2` (m=19456,t=2,p=1)** — modern password hashing; dummy verify on unknown email to reduce user-enumeration timing leaks.
- **Default-deny + `@Public()`** — new routes are private unless explicitly opened; covered by an enumeration test.
- **Refresh rotation with 10s grace + family revoke on reuse** — multi-tab safe; detects stolen-token reuse.
- **BullMQ 6 `upsertJobScheduler` for daily session cleanup** — `repeat` on `Queue.add` was removed in BullMQ 6; register from the worker only.

## Docker / CI / tests

- **`turbo prune --docker` for API/web images** — cache dependency layers; keep workspace `minimumReleaseAge` inside the image build.
- **Copy root `tsconfig.base.json` into Docker builder after prune** — prune omits it; without it shared/api tsc falls back to ancient `lib` defaults.
- **`allowBuilds` for `cpu-features` / `protobufjs` / `ssh2`** — Testcontainers → Dockerode needs those install scripts.
- **One API image, three roles (api / worker / migrate)** — same artifact; compose overrides the command.
- **Only Caddy publishes 80/443** — all other services on an internal compose network.
- **Local Caddy: `SITE_ADDRESS=":80"` + `CADDY_AUTO_HTTPS="auto_https off"`** — bare `localhost` enables Caddy’s local HTTPS and 308-redirects HTTP; unquoted `http://…` env values are awkward for Compose/dotenv.
- **`nginxinc/nginx-unprivileged:1.28.0-alpine` for web** — non-root static serving on 8080 behind Caddy.
- **Testcontainers Postgres 18 helper** — disposable DB for concurrency tests later; existing specs keep using docker-compose.dev.
- **No Mailpit in production compose** — `SMTP_*` points at the client’s real server.
- **Backups / monitoring deferred** — explicitly out of scope until later phases / go-live.
- **`allowBuilds.argon2: true`** — native binding build script required for Argon2id.
- **`@nestjs/jwt@12.0.4` (not 12.0.5)** — 12.0.5 was inside `minimumReleaseAge` when Task 7 landed; pin noted here.
- **`fastify@5.12.8` direct dependency** — type imports for `FastifyRequest` / `FastifyReply` (already transitive via Nest).

## Audit / permissions (Task 8)

- **`@casl/ability@7.1.3` + `@casl/react@7.1.0`** — age-safe under `minimumReleaseAge`; ability factory in `@ddcrm/shared`, React bindings only in web. `@casl/react` v7 replaced `createContextualCan` with built-in `AbilityProvider` + `Can`.
- **Hybrid actor context (extension + `PrismaService.transaction`)** — Prisma 7 query extensions do not intercept `$transaction`; wrapping every write in its own batch tx breaks interactive rollback. Standalone writes use the RLS batch pattern; multi-step writes must use `transaction()`.
- **`updateActorContext` mutates the ALS store in place** — a second `enterWith` from JwtAuthGuard bound only to the guard frame, so handlers still saw `actorUserId: null` from `onRequest`.
- **ESLint ban on `$transaction` / `$executeRaw` / `$executeRawUnsafe` / `$queryRawUnsafe` outside `apps/api/src/prisma`** — keep raw access centralized with the actor helpers.
- **Fastify 5 hop-index trust function for `TRUST_PROXY_HOPS`** — numeric `trustProxy: N` is fail-closed in Fastify 5; never `true`.
- **`ACCOUNT_LOCKED` vs `TOO_MANY_REQUESTS`** — separate 429 codes so lockout and IP throttle get different BG messages / `Retry-After`.
- **Nav stays role-based for now** — will move to CASL `<Can>` once more subjects exist.
- **Login throttle 10/min** — aligned with the 10-failure lockout window so throttle does not mask lockout testing as often.

## Users / areas (Task 9)

- **No physical deletes for users or areas** — deactivate with `is_active`; rows stay for audit and FK history.
- **Always at least one active ADMIN** — last-admin guard uses `SELECT … FOR UPDATE` inside a transaction to close deactivate/role-change races.
- **Admin never types user passwords** — server generates a temporary password; shown once in the UI; `must_change_password` until the user changes it.
- **Scoped read outside scope → 404 `NOT_FOUND`** — not 403, so FIELD/OFFICE cannot probe ids they cannot access.
- **Area scoping via CASL + central helper, not `@casl/prisma`** — Prisma 7’s `prisma-client` generator and our ESLint raw-query ban make `@casl/prisma` a poor fit; `MongoAbility` rules live in `@ddcrm/shared`, API maps `accessibleAreaWhere(ability)` to Prisma `where` for lists and get-one checks.
- **Email immutable after create** — updates change name, phone, role, areas, and status only.
- **Deactivating an area keeps `user_areas` rows** — inactive areas are ignored for permissions, pickers, and `me`/`login` area lists.
- **FIELD → other role keeps `user_areas` rows** — ignored for non-FIELD roles; switching back to FIELD reuses assignments.
- **Bull Board at `/api/admin/queues`** — requires a valid admin session (`access_token` cookie, path `/api`) and CASL `manage Setting`; legacy `/admin/queues` returns 404; basic auth and `BULL_BOARD_*` env removed.
- **Pins:** `libphonenumber-js@1.13.16` (1.13.17 still inside `minimumReleaseAge`); `@casl/prisma` not pinned (incompatible with our Prisma path — central helper instead); `@casl/ability@7.1.3` direct dependency in API for any future use (already in shared).
