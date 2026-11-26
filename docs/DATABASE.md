# Database conventions

## Primary keys

- Use UUID v7 primary keys.
- Generate IDs in the application (not in Postgres defaults).
- Column type: `UUID`.
- Column name: `id`.

## Timestamps

- `created_at` and `updated_at` are required on every **business** table.
- Type: `TIMESTAMPTZ`.
- Store and compare values in UTC.
- Exception: `auth_sessions` is append-only (rotation/revocation columns) and has `created_at` only — no `updated_at`.

## Money

- Use `NUMERIC(12, 2)` for monetary amounts.
- Do not use floating-point types for money.

## Naming

- Tables and columns use `snake_case`.
- Prisma models may use PascalCase / camelCase mapped with `@@map` / `@map`.

## Soft deletes

- Do not use physical deletes for business rows.
- Add `deleted_at TIMESTAMPTZ NULL` and filter it out in queries.
- Prefer unique constraints that account for `deleted_at` when needed.

## Extensions

The first migration enables:

- `pg_trgm` — trigram similarity / fuzzy search (including Cyrillic)
- `unaccent` — accent-insensitive matching
- `pgcrypto` — cryptographic helpers

Later migrations may add:

- `btree_gist` — GiST support for scalar equality combined with range operators (used by subscription non-overlap)

## Exclusion constraints (non-overlapping ranges)

Pattern used by `subscriptions`: one open interval per site at a time.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_site_daterange_excl
  EXCLUDE USING gist (
    site_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );
```

- Inclusive bounds (`'[]'`): ending on day D and starting on D+1 do **not** overlap.
- A null `end_date` makes the range open-ended (unbounded upper).
- Violation SQLSTATE `23P01` is mapped in the API to `SUBSCRIPTION_OVERLAP`.

## Audit log

`audit_log` is append-only (triggers reject UPDATE / DELETE / TRUNCATE). Row
changes on attached tables are captured by `audit_row_change()`; register with
`audit_attach(table, masked[], ignored[])`. Actor identity comes from
transaction-local `app.*` settings — see [AUDIT.md](./AUDIT.md).

## Raw SQL migrations

Use Prisma migrate for schema changes. For triggers, check constraints, partial indexes, or extension-specific indexes, add raw SQL in the migration file.

Example workflow:

```bash
pnpm db:migrate --name add_example_trigger
```

Then edit the generated SQL under `apps/api/prisma/migrations/<timestamp>_add_example_trigger/migration.sql`:

```sql
-- Example: keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_example_set_updated_at
BEFORE UPDATE ON example
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Example: soft-delete-aware uniqueness
CREATE UNIQUE INDEX example_email_active_uidx
ON example (email)
WHERE deleted_at IS NULL;
```

## Idempotency via unique key (visits)

Pattern: unique index on `(created_by, client_mutation_id)`. The API catches
unique violations (and pre-checks) and either returns the existing row (**200**)
when the business fields match, or **409**
`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY` when they differ. No application-
level cache.

## Trigger-enforced visit rules

- **Subscription window** — `BEFORE INSERT/UPDATE` on `visits`: if
  `subscription_id` is set, `visit_date` must fall in that subscription’s
  `[start_date, end_date]` (null end = open).
- **Exactly one LEAD** — deferred constraint triggers on `visit_employees`
  (and after visit insert) require ≥ 1 employee and exactly one `LEAD` per
  visit by end of transaction.
- **No future visit_date** — CHECK:
  `visit_date <= (created_at AT TIME ZONE 'Europe/Sofia')::date`.
- **Cancel consistency** — CHECK tying `status` to the three cancel columns.

Deploy migrations in non-dev environments with:

```bash
pnpm db:deploy
```

## Task 14 (This Month)

**No schema change.** List, summary, and calendar are read-only queries over
existing `sites`, `subscriptions`, `visits`, and `visit_employees`.

## Task 15 (Invoices)

### Counter

`invoice_counters` is a singleton row (`id = 'default'`, `next_value >= 1`). Issue
takes `SELECT … FOR UPDATE`, uses the current value as the invoice number, then
writes `next_value + 1`. This is **not** a Postgres `SEQUENCE` — locking the row
keeps numbering gapless under concurrency.

### Immutability (trigger-before-audit)

`BEFORE UPDATE OR DELETE` on `invoices` and `invoice_lines` raises SQLSTATE
`23P02` when the parent invoice is `ISSUED`. Because the trigger is **BEFORE**,
a blocked mutation never fires the AFTER `audit_row_change` triggers → **zero**
audit rows for rejected writes. The API maps `23P02` → `INVOICE_IMMUTABLE`.

### Visit link uniqueness

`invoice_visit.visit_id` is globally `UNIQUE` — a visit belongs to at most one
invoice. Own UUID PK so `audit_attach` has a stable entity id.

## Task 16 (Invoice documents)

### Partial UNIQUE — one credit note per invoice

```sql
CREATE UNIQUE INDEX invoices_one_credit_note_per_invoice_uidx
  ON invoices (references_invoice_id)
  WHERE document_type = 'CREDIT_NOTE';
```

### Batch idempotency

```sql
CREATE UNIQUE INDEX invoices_site_billing_month_uidx
  ON invoices (site_id, billing_month)
  WHERE document_type = 'INVOICE' AND site_id IS NOT NULL;
```

### Extended immutability

`invoices_reject_issued_mutation` still raises `23P02` for issued mutations, with
explicit allowlists:

1. **Operational columns** (always): `email_sent_at`, `email_last_error`, `updated_at`.
2. **Credit-note cancel**: `ISSUED` → `CANCELLED_BY_CREDIT_NOTE` when a
   `CREDIT_NOTE` row with `references_invoice_id = OLD.id` exists in the same
   transaction; only `status` + `updated_at` may change on that path.

`DELETE` on issued / cancelled-by-credit-note remains forbidden.

### AFTER INSERT credit-note trigger

`invoices_after_insert_credit_note` runs after an `ISSUED` `CREDIT_NOTE` insert and
updates the referenced invoice to `CANCELLED_BY_CREDIT_NOTE`. Ordering: credit note
row is visible to the immutability trigger’s `EXISTS` check before that UPDATE.

### email_events

Append-style delivery log; `UNIQUE (job_id)`; `audit_attach('email_events', …)`.
`kind` is `INVOICE` | `REMINDER` (default `INVOICE`).

## Task 17 (Payments)

### Overpay trigger

`BEFORE INSERT OR UPDATE OR DELETE ON payments`:

- UPDATE/DELETE → SQLSTATE `23P02` (`PAYMENT_IMMUTABLE`)
- INSERT: lock invoice, `Σ existing + NEW.amount > gross_amount` → SQLSTATE `23P03` (`PAYMENT_EXCEEDS_OUTSTANDING`)

API also `SELECT … FOR UPDATE` the invoice before insert so concurrent payments serialize.

### Handover immutability (no balance check)

`cash_handovers` reject UPDATE/DELETE (`23P02` → `HANDOVER_IMMUTABLE`). There is **no** balance check — over-handover is intentional.

### `due_date` vs operational columns

- **Operational** (always editable on issued): `email_sent_at`, `email_last_error`, `updated_at`.
- **`due_date`** is set in the same UPDATE that issues the invoice (DRAFT rows are not gated). After issue it is in the immutability equality lists — not editable. Not an “operational” column.
- Credit/debit notes copy `due_date` from the original at create.

## Task 18 (Products / monitoring / service reports)

### SQLSTATE table (integrity-constraint class, unused codes)

| SQLSTATE | Meaning | API mapping |
|---|---|---|
| `23P01` | Subscription overlap (EXCLUDE) | `SUBSCRIPTION_OVERLAP` |
| `23P02` | Issued invoice / payment / handover immutability | `INVOICE_IMMUTABLE` / `PAYMENT_IMMUTABLE` / `HANDOVER_IMMUTABLE` |
| `23P03` | Payment exceeds outstanding | `PAYMENT_EXCEEDS_OUTSTANDING` |
| `23P04` | Visit child rows frozen (invoice issued) | `VISIT_PRODUCTS_FROZEN` / `POINT_CHECK_FROZEN` |
| `23P05` | Point does not belong to visit site | `POINT_NOT_IN_SITE` |

### Freeze trigger pattern

`BEFORE INSERT OR UPDATE OR DELETE` on `visit_products` and `monitoring_point_checks` looks up the visit’s linked invoice via `invoice_visit`. If status is not `DRAFT` (and a link exists), raise `23P04`. Rejected writes never reach AFTER audit triggers.

### Point-in-site trigger

`BEFORE INSERT OR UPDATE OF point_id, visit_id` on `monitoring_point_checks` requires `monitoring_points.site_id = visits.site_id`, else `23P05`.

### Count-sync trigger

`AFTER INSERT OR UPDATE OR DELETE` on `monitoring_points` recalculates `sites.monitoring_points_count` as the count of **active** points for that site.

### Snapshot-on-issue ordering

`AFTER UPDATE OF status ON invoices`: when an `INVOICE` transitions to `ISSUED`, copy current `visit_products` ⨝ `products` fields into `visits.visit_products_snapshot` for linked visits (only if snapshot is still NULL). Runs inside the issue transaction; touches **visits only**, not invoices (issued immutability unchanged).

### visit_products DELETE

Real DELETE pre-freeze (mistaken link). Contrast with payments (INSERT-only). Soft-archive applies to `products` and `monitoring_points` (`archived` / `active`), not to link/check rows.

### photo_file_id

`monitoring_point_checks.photo_file_id` is nullable FK-ready column, **unused in P9** — reserved for a future photo task without a migration.

## Compliance / GDPR (Task 19)

**No EGN column** on `client_employees` or anywhere else (standing decision).

### Erasure CHECK

`client_employees_erasure_chk`: either not erased, or (`erased_at`, `erased_by`, `erase_reason` ≥ 3 chars, `full_name = '[изтрито]'`, and `job_title` is null or `'[изтрито]'`). Partial anonymization is rejected. API must update all fields in one statement.

### Agreement renewal partial unique

`UNIQUE (previous_agreement_id) WHERE previous_agreement_id IS NOT NULL` — one renewal per signing (chain, not tree).

### Food record → schedule trigger

`AFTER INSERT ON food_sample_records`: when `schedule_id` is set, `food_sampling_schedules.next_due_at := next_due_at + cadence_months`. Trigger is the source of truth; API does not double-update.

### No DELETE

`BEFORE DELETE` reject triggers on `client_employees`, `health_certificates`, `agreements`, `food_sampling_schedules`, `food_sample_records` (SQLSTATE `23P06`). Soft/anonymize/archive only. `audit_attach` registered on all five.

### stored_files

Minimal registry so certificate/result document FKs can point at Task 4 storage keys; erasure nulls FKs then deletes registry + object.

## Notifications (Task 20)

`clients.notify_by_email BOOLEAN NOT NULL DEFAULT false`. No backfill.

### Dedup

Two partial unique indexes, because a client-contact row has a null user id and a system-user row has a null client id:

- `UNIQUE (recipient_user_id, kind, entity_type, entity_id, threshold_day) WHERE recipient_user_id IS NOT NULL`
- `UNIQUE (recipient_client_id, kind, entity_type, entity_id, threshold_day) WHERE recipient_client_id IS NOT NULL`

The sweep inserts with `ON CONFLICT DO NOTHING` on that partial index (PostgreSQL 15+; this project is 18). `threshold_day >= 0`. A CHECK requires exactly one of the two recipient ids, matching `recipient_type`.

### Immutable content

`notifications` has no `updated_at`. A BEFORE UPDATE trigger rejects any change except `read_at` and `dismissed_at` (SQLSTATE `23P06`). BEFORE DELETE also raises `23P06`. Dismiss sets `dismissed_at`. `audit_attach('notifications')` is registered, so create / read / dismiss write audit rows.

### email_events

`EmailEventKind` gained `NOTIFICATION` in its own migration (a new enum value cannot be used in the same transaction). `invoice_id` is nullable. `notification_id` is a nullable FK to `notifications` (RESTRICT). A CHECK keeps the shapes exclusive: INVOICE and REMINDER require `invoice_id` and a null `notification_id`; NOTIFICATION is the reverse. Index `(notification_id, created_at DESC)`.

### No PII in body_params

`body_params` never contains a person's legal name, an email, a phone, an amount, or an EGN (EGN does not exist anywhere). Allowed keys are site name, dates, invoice number, and system ids (`siteId`, `employeeId`, `entityId`, `thresholdDay`, `serviceType`). The same allowlist is applied before the row is stored and again when the email is rendered.

## Reports (Task 21 / Phase 12)

**No schema changes.** All six reports are read queries against existing tables.

### Expirations UNION (application-level)

`EXPIRATIONS` merges rows from `health_certificates` (by `next_renewal_at`), `agreements` (by `expires_at`), and `food_sampling_schedules` (by `next_due_at`) in the report service — three queries + in-memory merge/sort, not a SQL `UNION`. Indexes already present on those date columns are enough for seed volumes; propose a covering index only if production timing justifies it.

### Index check (not added)

Verified existing indexes cover likely filters (`payments.paid_at` / `collected_by_user_id`, invoice status/due date paths, food `next_due_at`). No silent index migration in P12.
