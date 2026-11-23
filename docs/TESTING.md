# Testing

## Unit vs integration

| Kind | Location | Needs |
|------|----------|-------|
| Unit | `apps/api/test/*.spec.ts`, `apps/web/src/**/__tests__` | nothing |
| Integration (shared infra) | e.g. `extensions.spec.ts`, `queues.spec.ts`, `storage.spec.ts` | `pnpm infra:up` |
| Integration (disposable DB) | `apps/api/test/helpers/*.spec.ts` | Docker (Testcontainers) |
| E2E | `apps/web/e2e` | Playwright (starts its own API + Vite) |

## Playwright servers

Playwright **always starts its own** API and Vite processes (`reuseExistingServer: false`) so a stale local `pnpm dev` API without `E2E=1` cannot cause login throttling flakes.

Opt in to reuse an already-running stack for local debugging:

```bash
PW_REUSE=1 pnpm --filter @ddcrm/web test:e2e
```

The API webServer entry still sets `E2E=1` on the process it starts (skips Nest throttling).

## E2E data: unique names + search

Any Playwright test that **creates** rows (clients, sites, areas, users, site types, …) must:

1. Give the new row a **unique name** (timestamp and/or random suffix).
2. **Find it through the search filter** (or an exact unique email/EIK lookup), never by list/table position or “first row”.

Lists are paginated and sorted; position-based lookups flake once enough seed/prior-run data exists. Shared helpers live under `apps/web/e2e/`; import `test` / `expect` from `./fixtures` so the console/`/api` guard is on.

## Console / network guard

`apps/web/e2e/fixtures.ts` fails a test on unexpected `console.error`, uncaught `pageerror`, or same-origin `/api` responses with status ≥ 400.

Always allowed: `401` on `/api/auth/me` (SPA session probe before login / after logout). Allow other expected failures per test:

```ts
test.use({
  consoleGuard: {
    allowApiFailures: [{ status: 401, url: /\/api\/auth\/login/ }],
  },
});
```

## Performance database

Perf seeds (`seed-perf-clients.ts`, `seed-perf-sites.ts`) use a **separate** Postgres database `ddcrm_perf` (or `PERF_DATABASE_URL`). They create it if needed, migrate, run timings/EXPLAIN, then **drop** it unless `PERF_KEEP=1`. They must not write into the shared e2e/dev database.

## Database helper (Testcontainers)

`apps/api/test/helpers/db.ts` starts Postgres **18** (same major as production), runs `prisma migrate deploy`, and returns:

- `prisma` — Prisma client
- `resetDb()` — truncates all public tables except `_prisma_migrations`
- `stop()` — disconnects and removes the container

Example suite: `apps/api/test/helpers/db.extensions.spec.ts`.

### Concurrency tests (later phases)

Use one container per file (or per `describe`), call `resetDb()` in `beforeEach`, then fire parallel work:

```ts
import { startTestDb } from "./helpers/db";

const db = await startTestDb();
await db.resetDb();

await Promise.all(
  Array.from({ length: 50 }, () =>
    db.prisma.$executeRaw`SELECT 1`, // replace with real domain ops
  ),
);
```

Assert invariants afterwards (row counts, unique constraints, no lost updates). Always `await db.stop()` in `afterAll`.

### Run only the Testcontainers / helper tests

```bash
pnpm --filter @ddcrm/api exec vitest run test/helpers
```

### Run the shared-infra integration suite

```bash
pnpm infra:up
pnpm db:deploy
pnpm --filter @ddcrm/api test
```

Existing specs that talk to Garage, Redis, Gotenberg, or Mailpit keep using the docker-compose.dev services — do not point them at Testcontainers unless you also containerise those dependencies.
