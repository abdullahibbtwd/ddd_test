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

Deploy migrations in non-dev environments with:

```bash
pnpm db:deploy
```
