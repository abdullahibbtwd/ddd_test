# Testing

## Unit vs integration

| Kind | Location | Needs |
|------|----------|-------|
| Unit | `apps/api/test/*.spec.ts`, `apps/web/src/**/__tests__` | nothing |
| Integration (shared infra) | e.g. `extensions.spec.ts`, `queues.spec.ts`, `storage.spec.ts` | `pnpm infra:up` |
| Integration (disposable DB) | `apps/api/test/helpers/*.spec.ts` | Docker (Testcontainers) |
| E2E | `apps/web/e2e` | Playwright (starts Vite itself) |

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
