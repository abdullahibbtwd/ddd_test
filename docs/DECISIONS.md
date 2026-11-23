# Decisions (Tasks 1–14)

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

## Clients (Task 10)

- **No EGN on clients** — only display/contact fields and optional EIK; personal national IDs stay out of scope.
- **Archive, not delete** — `is_active=false`; archived rows block edits except reactivation; list defaults to active.
- **FIELD has no Client CASL rules yet** — office/admin manage clients; area-scoped **read** for FIELD arrives with Sites (Task 11).
- **Unique partial index on `eik`** — one client per ЕИК including archived; race guard maps `P2002` to `DUPLICATE_EIK`.
- **`PaymentMethod` shared enum** — `CASH` / `BANK_TRANSFER` / `CARD` / `OTHER` in `@ddcrm/shared` for clients now and payments later.
- **`name_normalized` in application code** — not a DB trigger; always set on create/update with `normalizeClientName`.
- **`SAME_EIK` hard block, `SIMILAR_NAME` warning** — duplicates endpoint uses exact EIK + `pg_trgm` similarity ≥ 0.6 on `name_normalized`.
- **`PrismaService` uses private field `db`** — avoids colliding with Prisma’s generated `client` model accessor (`prisma.client` vs a `client` property).
- **Trigram GIN indexes on `name` and `name_normalized`** — list search uses Prisma `contains`; similarity SQL lives under `apps/api/src/prisma/find-similar-clients.ts` with centralized raw queries.
- **Perf seed separate from dev seed** — `seed-perf-clients.ts` / `seed-perf-sites.ts` use database `ddcrm_perf` (or `PERF_DATABASE_URL`), not the shared e2e/dev DB; they drop it after evidence unless `PERF_KEEP=1`.

## Sites (Task 11)

- **Site belongs to one client + one ACTIVE area** — business status `ACTIVE` / `TERMINATED` (reversible); no physical deletes.
- **FIELD home is `/sites` until Visits** — Phase 5 moves FIELD home to `/visits`.
- **FIELD Site: read + create in assigned areas only** — no update in this task; out-of-scope read → 404; create outside areas → 403.
- **FIELD Client: scoped read + `quickCreate`** — readable when the client has a site in the user’s areas; new clients only via site quick-add (no FIELD `POST /clients`).
- **CASL `siteAreaId` condition** — mirrors Site `areaId` so `accessibleClientWhere` agrees with ability rules (`sites.some.areaId`).
- **Leaflet only (no react-leaflet)** — OSM tiles; CSP allows `img-src https://*.tile.openstreetmap.org` only; PWA `runtimeCaching` stays empty (no tile/API cache).
- **OSM tile use** — Referrer-Policy remains `strict-origin-when-cross-origin` (browser sends Referer to OSM by default). Fits small internal use; upgrade path is a hosted tile provider if traffic grows.
- **Playwright `reuseExistingServer: false`** — opt-in `PW_REUSE=1` for local debug; avoids stale API without `E2E=1`.
- **Pins:** `leaflet@1.9.4`, `@types/leaflet@1.9.21` (both outside `minimumReleaseAge`).

## Subscriptions / scheduling (Task 12)

- **At most one subscription active per site per day** — history kept; Postgres `EXCLUDE USING gist` on `daterange(start_date, end_date, '[]')` is the real guard (API maps `23P01` → `SUBSCRIPTION_OVERLAP`).
- **Local DATE in Europe/Sofia** — no timestamps for subscription windows; `todayInSofia` is the only timezone-aware helper.
- **Rolling month schedule from last done visit** — not a fixed calendar; any done visit at the site counts (all treatment types).
- **Rate change affects future visits only** — each visit will store its own charge (Task 13); no rate-history table.
- **Terminating a site auto-ends the current subscription in the same transaction** — reactivate does not revive it.
- **`btree_gist` extension** — required for UUID equality + range overlap exclusion.
- **Duplicate services CHECK via immutable helper** — Postgres forbids subqueries in CHECK; `array_elements_are_unique()` wraps the distinct count.
- **Pins:** none new for Task 12.

## Visits (Task 13)

- **Visits snapshot the charge; subscriptions do not retroactively rewrite history** — `charged_amount` / `rate_includes_vat` live on the visit (copied from the current subscription at save, or entered for one-offs).
- **Cancel, never delete** — `ACTIVE` \| `CANCELLED` with required reason; no DELETE endpoint; cancelled rows stay in history.
- **Idempotency via `(created_by, client_mutation_id)`** — unique index; matching retry → 200; different body → 409. No in-memory cache.
- **FIELD 7-day / 24-hour windows are tracker assumptions pending client answer** — Sofia calendar for visit dates; absolute UTC for the edit window (DST-safe).
- **`visit_employees` has its own UUID PK** — required by `audit_attach` (same pattern as `user_areas`); business uniqueness remains `(visit_id, user_id)`.
- **Pins:** none new for Task 13; `minimumReleaseAge` unchanged.

## This Month / scheduling views (Task 14)

- **Status computed server-side once** — `computeScheduleStatus` runs in the API; list, summary tiles, and calendar all read the same payloads. The web never re-implements the rules.
- **One filter, three views** — `GET /api/scheduling/month` (+ `/month/days` for calendar buckets); no separate dashboard route; no revenue/amounts on this screen.
- **No-subscription sites excluded from `/month` and counted separately** — `summary.withoutSubscription`; UI muted link to `/sites?hasSubscription=false`.
- **Employee filter = LEAD of last ACTIVE visit this month, else `created_by` of most recent ACTIVE visit ever** — ASSIST-only does not match; out-of-scope filter values return empty (200), not 404.
- **Cancelled visits ignored** as schedule inputs (same as Task 12 engine contract).
- **`computeScheduleStatus` unchanged** — ON_DEMAND stays ON_DEMAND even with a visit this month (engine priority before SERVICED).
- **Pins:** none new for Task 14; `minimumReleaseAge` unchanged.
