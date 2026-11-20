# Queues

Background jobs use BullMQ via `@nestjs/bullmq`. The API process only **enqueues** jobs.
The worker process (`apps/api/src/worker.ts`) is the only entry point that imports
`ProcessorsModule` and therefore the only process that **consumes** jobs.

Production runs two containers from the same image:

- `node dist/main.js` — HTTP API (producers + Bull Board)
- `node dist/worker.js` — workers (consumers)

## Queues

| Queue | Name constant | Intended use |
|-------|---------------|--------------|
| `default` | `QUEUE_NAMES.DEFAULT` | General / misc jobs (e.g. health ping). Prefer a dedicated queue once a domain grows. |
| `email` | `QUEUE_NAMES.EMAIL` | Outbound email (SMTP via Mailpit in dev). |
| `pdf` | `QUEUE_NAMES.PDF` | PDF generation via Gotenberg and related file work. |
| `notifications` | `QUEUE_NAMES.NOTIFICATIONS` | In-app / push-style notifications and reminder delivery. |

Queue name constants live in `@ddcrm/shared` (`QUEUE_NAMES`).

## Retry policy

Default job options (both entry points):

- **attempts:** 5
- **backoff:** exponential, starting at **5 seconds**
- **removeOnComplete:** keep the last **1000** completed jobs
- **removeOnFail:** keep failed jobs for **14 days**

Override attempts/backoff only in tests or for a specific job that has a documented reason.

## Deterministic job IDs

Use `jobId(...parts)` from `@ddcrm/shared` when a logical job must exist at most once:

```ts
import { jobId } from "@ddcrm/shared";

jobId("invoice-email", invoiceId); // -> "invoice-email_<id>"
jobId("cert-reminder", certId, 30); // -> "cert-reminder_<id>_30"
```

Parts are joined with `_`. Empty parts and parts containing `:` are rejected (BullMQ
treats `:` specially in custom job ids). Do not put `:` in `BULLMQ_PREFIX` or queue names.

Pass that string as BullMQ `jobId` when adding the job. Enqueueing the same `jobId`
again must not create a second job (only one job remains for that id).

## Idempotency (required)

Every processor must be **idempotent**: safe to run twice for the same logical work.
Retries, restarts, and duplicate deliveries happen. Prefer upserts, “already done”
short-circuits, and deterministic side effects keyed by the job id / business id.

## Adding a processor

1. Prefer an existing queue from `QUEUE_NAMES`, or add a new name in `@ddcrm/shared` and register it in `QueueModule`.
2. Create a `@Processor(QUEUE_NAMES.…)` class extending `WorkerHost` under `apps/api/src/processors/`.
3. Register the processor in `ProcessorsModule` only — never import `ProcessorsModule` from `AppModule`.
4. From the API (or other producers), inject the queue with `@InjectQueue(...)` and `queue.add(...)`.
5. Document the job payload and idempotency key in this file or next to the processor.

## Repeatable jobs (scheduler foundation)

Register schedulers from the **worker** only (`RegisterRepeatableJobs` in
`ProcessorsModule`), with timezone `Europe/Sofia`.

BullMQ 6 removed `repeat` on `Queue.add`. Use `upsertJobScheduler` with a
deterministic scheduler id (`jobId(...)`) so restarts do not duplicate:

```ts
await queue.upsertJobScheduler(
  jobId("auth-sessions-cleanup"),
  {
    pattern: "0 3 * * *",
    tz: "Europe/Sofia",
  },
  {
    name: "auth-sessions-cleanup",
    data: {},
  },
);
```

### Current schedulers

| Scheduler id | Job name | When | What |
|--------------|----------|------|------|
| `auth-sessions-cleanup` | `auth-sessions-cleanup` | 03:00 Europe/Sofia daily | Delete `auth_sessions` with `expires_at` older than 7 days (idempotent) |

## Bull Board (queue UI)

| | |
|--|--|
| **URL** | `/api/admin/queues` (under the API global prefix) |
| **Auth** | Admin session — `access_token` httpOnly cookie (path `/api`); CASL `manage Setting` |
| **Legacy** | `/admin/queues` → **404** (removed with basic auth) |

The UI is registered as a Fastify plugin on the API process (`registerBullBoard`). It is not behind Nest guards, so the plugin performs JWT + ability checks on each request. Mutating Bull Board actions still respect `OriginGuard` allowlists.

Dev: open after logging in as an admin (e.g. Vite proxy `http://localhost:5173/api/admin/queues`). Production: same-origin via Caddy to the API container.

There are no `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD` environment variables.
