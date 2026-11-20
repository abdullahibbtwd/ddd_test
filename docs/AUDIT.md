# Audit log

## Table

`audit_log` is append-only. Columns: `id` (UUID v7), `occurred_at`, `source`
(`api` \| `worker` \| `cli` \| `system`), `actor_user_id` (nullable, **no FK**),
`actor_label`, `action`, `entity_type`, `entity_id`, `before` / `after` (jsonb),
`changed_fields` (text[]), `meta`, `request_id`, `ip`.

Indexes: `(entity_type, entity_id, occurred_at desc)`,
`(actor_user_id, occurred_at desc)`, `(occurred_at desc)`.

## Append-only (database)

Triggers raise an exception on `UPDATE`, `DELETE`, and `TRUNCATE` of
`audit_log`.

**Hardening note:** the table owner can still `DROP TRIGGER`. A restricted DB
role that cannot drop triggers is a go-live item.

## Row capture (database trigger)

Generic `audit_row_change()` records INSERT / UPDATE / DELETE:

- snapshots via `to_jsonb`; masked columns omit **values** but keep names in
  `changed_fields`
- ignored columns (+ always `updated_at`): an UPDATE that only touches these
  writes **no** audit row
- register a table with `SELECT audit_attach('table', masked[], ignored[])`

Registered now:

- `users` — masked `password_hash`; ignored `last_login_at`, `failed_login_count`, `locked_until`.
- `areas` — no masked or ignored columns.
- `user_areas` — junction rows for FIELD area assignments.

**Not** row-audited: `auth_sessions` (noise), `audit_log` (recursion),
`_prisma_migrations`. Session security events use `AuditService` instead.

## Actor context (application)

AsyncLocalStorage holds `source`, `actorUserId`, `actorLabel`, `requestId`, `ip`.

HTTP fills it on `onRequest` (and JWT sets the user id). Workers set
`source: worker`, `actorLabel: worker:<queue>:<job>`. CLI sets
`source: cli`, `actorLabel: cli:<command>`.

The trigger reads transaction-local settings via
`current_setting('app.*', true)`. Values are applied with
`set_config(name, value, true)` (**is_local = true** only — never session-level
on pooled connections).

### Hybrid write design

1. **Single writes** — Prisma query extension wraps
   `create` / `update` / `delete` / `*Many` / `upsert` in
   `$transaction([set_config…, write])` unless `inTransaction` is set.
2. **Multi-step writes** — only `PrismaService.transaction(fn)` (or
   `runAppTransaction`) may open an interactive transaction. It sets all five
   `app.*` keys once, then runs `fn(tx)` with `inTransaction = true` so the
   extension does not double-wrap. Nested `transaction()` reuses the outer tx.
3. ESLint bans `$transaction`, `$executeRaw`, `$executeRawUnsafe`, and
   `$queryRawUnsafe` outside `apps/api/src/prisma` (and migrations).

A write with **no** context still succeeds; the row is `source = system` with a
null actor, and the extension logs a warning (`model` + `operation`).

## Explicit security events

`AuditService.log({ action, entityType, entityId, actorUserId, meta })` inserts
into `audit_log` in the current context.

Actions: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`,
`PASSWORD_RESET_BY_ADMIN`, `ACCOUNT_LOCKED`, `REFRESH_REUSE_DETECTED`.

Rules: known-account `LOGIN_FAILED` uses that user as actor; unknown email uses
`meta: { reason: 'unknown_email' }` and **never** stores the email. Never store
passwords, tokens, or hashes in any audit field. Row-level actions use
`CREATE` / `UPDATE` / `DELETE`.

## API

`GET /api/audit-log` — ADMIN only (`@Can('read', 'AuditLog')`), paginated
(`PageQuery` + `entityType`, `entityId`, `actorUserId`, `action`, `from`, `to`),
newest first. Each item includes looked-up `actorName` (null if deleted/system).
