# Decisions (Tasks 1–21)

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

## Invoicing (Task 15)

- **FIELD has no invoice access** — nav + `canAccessPath` gated to ADMIN/OFFICE only (R-3.04 FIELD issue deferred; payments stay FIELD-visible).
- **Gapless counter table, not a Postgres SEQUENCE** — `SELECT … FOR UPDATE` on `invoice_counters` so concurrent issue cannot skip or duplicate numbers.
- **Issued immutability via BEFORE triggers (SQLSTATE `23P02`)** — blocked UPDATE/DELETE never reaches AFTER audit triggers → zero audit rows for rejected mutations.
- **VAT 20% auto-line on visit link** — working default for suggested lines; final rate policy tied to **Q-accountant**.
- **HALF_UP at 2 dp, per line then sum** — matches money helpers in `@ddcrm/shared`; subject to Q-accountant confirmation.
- **No decimal library** — pure decimal strings + BigInt fixed-point in shared (`computeLineTotal` / `computeVatAmount` / `sumLines`); Prisma `Decimal` only at the DB boundary.
- **Visit ↔ invoice UNIQUE(visit_id)** — a visit may appear on at most one invoice (draft or issued).
- **Pins:** none new for Task 15; `minimumReleaseAge` unchanged. Do not change `computeScheduleStatus`.

## Invoice documents (Task 16)

- **PDF from issued snapshot only** — never live client/visit/subscription; original and copy differ only by the `ОРИГИНАЛ`/`КОПИЕ` stamp.
- **Email always queued** — HTTP enqueues BullMQ (`invoice-email`) and returns 202; worker renders PDF + SMTP; deterministic `invoice_email_<id>_<attempt>` job ids.
- **Credit/debit notes are new documents** — same gapless counter series; credit note cancels original (`ISSUED` → `CANCELLED_BY_CREDIT_NOTE`) in the same tx; debit note leaves original issued.
- **Operational-column immutability exception** — `email_sent_at` / `email_last_error` (plus `updated_at`) may update on issued invoices; nothing else.
- **PDFs not stored on disk** — regenerate on every GET/send (cheap; no storage lifecycle).
- **One numbering series** for invoices + credit + debit notes.
- **Credit note is the cancellation mechanism** — reason lives on the credit note; original snapshot/financials untouched.
- **Batch creates drafts only** — issue is a separate human action; batch/issue is per-id, partial failure keeps successes.
- **Supplier config object** in `apps/api/src/config/supplier.ts` with TODO Phase 13 settings; client must provide real values; accountant confirms wording/layout (**Q-accountant**).
- **Pins:** none new for Task 16; `minimumReleaseAge` unchanged. No new PDF library or BullMQ pins (reuse Task 3/4 stack).

## Payments (Task 17)

- **Payments are additive rows; balance is computed** — no stored outstanding column; overpay rejected by DB trigger (`23P03` → `PAYMENT_EXCEEDS_OUTSTANDING`).
- **Cash handovers are a separate table** — employee cash outstanding may be negative (over-handed is legal and visible).
- **Paid is not an InvoiceStatus** — outstanding == 0 on ISSUED; keeps issued financial immutability intact.
- **Reminders are queued emails** (`payment-reminder`), not the Phase 11 notification bell.
- **Payments are INSERT-only in P8** — no reversals/refunds; future reversal row referencing the original payment (P13).
- **`due_date` is set during issue and never edited** — included in immutability equality lists; issue transition sets it in the same UPDATE; CN/DN inherit.
- **FIELD pays via visit route only** — `POST /api/visits/:visitId/payments` (CASH, own visit); no access to outstanding report or other users’ cash ledgers.
- **Pins:** none new for Task 17; `minimumReleaseAge` unchanged.

## Products / service reports / monitoring (Task 18)

- **Product archive, never delete** — partial unique on active names; archival is a boolean + audit row (no reason field).
- **Freeze boundary = until invoiced** — `visit_products` and `monitoring_point_checks` are editable while the linked invoice is absent or DRAFT; frozen when ISSUED (`23P04`). Same boundary as “until invoiced” applied to child tables.
- **Snapshot = JSONB on visits** — `visit_products_snapshot` written inside the invoice issue transaction (AFTER UPDATE on invoices → visits only). No separate snapshot table; no never-to-be-invoiced confirm path in this model (snapshots only on issue). PDF reads snapshot if present, else live rows.
- **Count sync via trigger** — `monitoring_points` AFTER trigger maintains `sites.monitoring_points_count` (cannot drift). Site PATCH count wires to the reconcile helper; UI uses PATCH site.
- **Checks are visit-scoped only** — no standalone inspection model. `photo_file_id` reserved, unused in P9.
- **Service report: no series, no email, no storage** — one PDF per visit on demand; minimum data = site + date + treatment_type + ≥1 employee.
- **Pins:** none new for Task 18; `minimumReleaseAge` unchanged. No new PDF library (reuse Task 4 Gotenberg stack).

## Compliance / GDPR (Task 19 / Phase 10)

- **No EGN anywhere** — standing rule restated; client employees identified by name + job title + site only.
- **Certificate renewal = new row** — never UPDATE prior dates to renew; history is the row stack; status is computed (`CURRENT`/`EXPIRING`/`EXPIRED`), never stored.
- **Agreement dual status kept** — stored `ACTIVE|EXPIRED|TERMINATED|RENEWED` captures business decisions; computed display combines calendar expiry with stored status. One renewal per signing (partial unique on `previous_agreement_id`). Frozen after renew.
- **Food schedule vs record** — separate tables; trigger advances `next_due_at` on record insert when linked; API does not double-update. Result row freezes once not `PENDING`.
- **No sampler link** — food sample records do not reference a client employee in P10.
- **READ_PII on every employee/certificate read** — explicit helper in read services (not Prisma middleware); one batched event per request with `meta.entityIds`; audit failure → `READ_PII_AUDIT_FAILED` (read must fail). Not applied to agreements/food.
- **Erasure is anonymization, not deletion** — CHECK enforces full anonymize in one UPDATE; rows and certificate history kept; document files nulled then deleted. No hard DELETE on these tables (reject trigger).
- **FIELD redacted certificates** — `GET /api/sites/:siteId/certified-employees`: names + `nextRenewalAt` + computed status; job title always `[скрито]`; produces READ_PII. ADMIN/OFFICE get full titles + counts.
- **Notifications deferred to Phase 11** — P10 ships expiring/due query endpoints only; no bell, no renewal emails. (Built in Task 20; this note stays as the Phase 10 record.)

## Notifications (Task 20 / Phase 11)

- **Stored rows, not computed on read** — a daily job inserts notification rows. The bell reads the user's unread rows. There is no "should this exist?" check when the list is opened.
- **Dedup is a partial unique key** — `(recipient, kind, entity, threshold_day)`. Thresholds are exactly 30, 14 and 7 for expiries, and 0 for due/overdue. A second run the same day is a no-op (`ON CONFLICT DO NOTHING`).
- **Recipient rules live in code, not a table** — `apps/api/src/notifications/rules.ts`. Certificate → office + admin. Agreement → office + admin + client contact when `clients.notify_by_email`. Food schedule → office + the lead on the site's latest active visit. Overdue invoice → office + admin.
- **Overdue invoice is notified once, not weekly** — `threshold_day = 0`. A sweep the next day does not add another row. R-4.6-04 was not found in the repo; the office already has the outstanding list. Food schedules use the same 0, so a schedule notifies once for its lifetime under this key. Recurrence would need the due date inside the threshold. That was not changed.
- **Two channels** — system-user email is always enqueued; client-contact email only when the rule includes it and `notify_by_email` is true (default false). The row is committed before the email job. SMTP failure does not roll back the bell item.
- **System actor** — sweep creates are audited as `source = system`, `actor_user_id = null`, `actor_label = system:notification-sweep`. No reserved user row (it would appear in the user list and interact with the last-admin rule). Email send updates use `source = worker`, same as Tasks 16–17.
- **Summary is ADMIN-only** — the bell is per user. OFFICE and FIELD can read and update their own rows. They cannot open the aggregate summary, and nobody can read another user's body or a client-contact body through `/me`.
- **Timezone** — the BullMQ scheduler uses explicit `tz: Europe/Sofia` (`0 7 * * *`). The process timezone is not used.
- **Pins:** none new for Task 20. `minimumReleaseAge` unchanged. BullMQ's existing `tz` option is enough; no new dependency.
- **Pins:** none new for Task 19; `minimumReleaseAge` unchanged. No new file-storage or PDF library pins (`stored_files` table is minimal FK registry for Task 4 keys).

## Reports / Excel+PDF export (Task 21 / Phase 12)

- **Reports are live queries, not snapshots** — no `report_runs` table, no scheduled/emailed reports, no stored result sets. JSON paginates; export uses page/batch cursor (500 rows) then writes the file.
- **ExcelJS 4.4.0 for XLSX; Gotenberg for PDF** — only new export package (named for review). PDF reuses the invoice HTML→Gotenberg path and supplier block. No CSV as a named format.
- **ADMIN/OFFICE only; FIELD excluded** — CASL `read Report`; nav «Справки»; both JSON and export return 403 for FIELD.
- **Export safety cap 200,000 rows** (`REPORT_EXPORT_TOO_LARGE` 413) before streaming starts; empty Excel keeps headers; empty PDF is one page «Няма данни за избрания период». Expirations export = `READ_PII` + `EXPORT` (certificate dates).
- **Pins:** ExcelJS `4.4.0` added under `apps/api` (review). `minimumReleaseAge` unchanged. No other new packages.
