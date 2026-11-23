# Clients (Task 10)

Domain model and rules for the `clients` table and `/api/clients` API.

## Table fields (`clients`)

| Column | Type | Notes |
|--------|------|--------|
| `id` | UUID | App-generated UUID v7 (`createId()`). |
| `kind` | `COMPANY` \| `INDIVIDUAL` | See below. |
| `name` | text | Display name; collapsed whitespace in the API. |
| `name_normalized` | text | Similarity / duplicate search form; set by API on create/update (not a DB trigger). |
| `eik` | text, nullable | 9 or 13 digits when set; **required** for `COMPANY`; **null** for typical `INDIVIDUAL`. |
| `vat_number` | text, nullable | `BG` + 9–10 digits format check only (no registry lookup). |
| `registered_address` | text, nullable | Free text. |
| `legal_representative` | text, nullable | Companies only; cleared when kind becomes `INDIVIDUAL`. |
| `phone` | text, nullable | Stored as E.164 when provided (`normalizePhone`). |
| `email` | text, nullable | Lowercased in API validation. |
| `preferred_payment_method` | enum, nullable | `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER` (`PaymentMethod` in `@ddcrm/shared`). |
| `notes` | text, nullable | Internal notes. |
| `is_active` | boolean | `true` by default; `false` = archived (soft archive, not deleted). |
| `created_at`, `updated_at` | timestamptz | Standard row timestamps. |

Indexes: partial unique on `eik` (where not null); `(is_active, name)` for default list; GIN trigram on `name` and `name_normalized` (`clients_name_trgm_idx`, `clients_name_normalized_trgm_idx`).

## `COMPANY` vs `INDIVIDUAL`

- **COMPANY** — legal entity: **EIK is required** (DB check + Zod + checksum validation). May have `legal_representative`, VAT number, registered address.
- **INDIVIDUAL** — natural person or sole trader without a stored company UIC: **EIK must be null** in normal use (optional EIK is validated if ever supplied). No `legal_representative`.

## What is **not** stored

- **EGN** (personal ID) — intentional privacy / scope choice; not part of Phase 1 clients.
- **Contracts, subscriptions, visits** — separate entities. **Sites** are in Task 11 (`docs/SITES.md`).
- **Registry lookup results** — EIK is format + checksum only; we do not call BULSTAT/Търговски регистър APIs.
- **Bank IBAN / payment instruments** — only a coarse `preferred_payment_method`, not account numbers.

## EIK / BULSTAT rules

**Length (legal):** Закон за регистър БУЛСТАТ, **чл. 6** — identifier is **9** digits, or **13** digits when a branch/office suffix is included.

- Official law PDF (Registry Agency / BULSTAT):  
  https://www.bulstat.bg/uploaded/files/4-zakonzaregistrbulstat.pdf  
- Practical registrar context: [Агенция по вписванията](https://www.registryagency.bg/) — unified identification code (ЕИК/БУЛСТАТ) for traders and branches.

**Checksum (implementation):** We use the published **two-weight-set mod-11** algorithm for 9-digit codes; 13-digit codes must pass the 9-digit check on the first nine digits, then a second mod-11 on digits 10–13 (indices 8–11 with check digit 13). This matches:

- Community / vendor validators (e.g. [svcs.bg](https://svcs.bg) ЕИК tools).
- Documented walkthroughs such as [EIK check-digit notes (Tsvetan V.)](https://tsvetanv.wordpress.com/2011/04/01/eik/).

Implementation: `validateEik()` in `packages/shared/src/eik.ts`. API + DB require `^\d{9}$` or `^\d{13}$` for companies.

**User-remembered rules — confirmed correct:**

| Rule | Status |
|------|--------|
| Only 9- or 13-digit all-numeric strings | Yes — rejected otherwise. |
| 13-digit includes valid 9-digit parent + branch check | Yes — both stages validated. |
| Checksum uses mod 11 with alternate weights when remainder is 10 | Yes — same as BULSTAT publications / svcs.bg. |
| VAT is `BG` + digits, separate from EIK checksum | Yes — `validateVatNumber()` is format-only. |

### Valid test vectors (checksum-verified)

| EIK | Note |
|-----|------|
| `831641791` | Public enterprises list / svcs.bg example |
| `131268894` | МЕДЕКС ООД (public references) |
| `175074752` | Checksum-valid UIC used in tests |
| `121031861` | Public enterprises list |
| `240000000` | Exercises remainder-10 → second weight path |
| `1312688940008` | Valid 13-digit branch pattern |
| `8316417910002` | Valid 13-digit branch pattern |

### Invalid test vectors (must reject)

| EIK | Why |
|-----|-----|
| `831641792` | Wrong 9-digit check digit |
| `131268895` | Wrong 9-digit check digit |
| `175074753` | Wrong 9-digit check digit |
| `240000001` | Wrong check on r==10 path |
| `1312688940009` | Valid parent, wrong branch check digit |
| `1312688950008` | Invalid parent 9-digit segment |
| `12345678` | Too short |
| `BG831641791` | Non-numeric / VAT prefix |
| `83164179a` | Non-digit character |

## `normalizeClientName`

Used for `name_normalized` and duplicate **similarity** search (`pg_trgm` `similarity()`).

Steps (see `packages/shared/src/clients.ts`):

1. Lowercase with Bulgarian locale.
2. Strip quote characters and punctuation.
3. Remove whole-word legal-form tokens (`ООД`, `ЕООД`, `EAD`, `OOD`, …).
4. Collapse whitespace.

Examples:

| Display `name` | `name_normalized` (conceptually) |
|----------------|----------------------------------|
| `РАМБО ЕООД` | `рамбо` |
| `Рамбо ООД` | `рамбо` |
| `Ресторант „Златната ябълка“` | `ресторант златната ябълка` |
| `  Фокус   ООД  ` | `фокус` |
| `Rambo EOOD` | `rambo` |

**`name_normalized` is computed in the API** on create and when `name` changes — there is no database trigger.

## Duplicates and archive

- **`SAME_EIK` (hard block):** Creating or updating to an EIK that already exists fails with `DUPLICATE_EIK`, including when the existing row is **archived** (`is_active=false`). A partial unique index `clients_eik_uidx` also guards races (`P2002` → same error).
- **`SIMILAR_NAME` (warning only):** `GET /api/clients/duplicates` runs `similarity(name_normalized, …) >= 0.6` (top 5). UI may warn; user can still save if EIK is unique.
- **Archive, not delete:** `is_active=false` freezes edits except reactivation (`is_active=true` alone). List defaults to active clients only.
- **Active sites block archive:** archiving a client that still has `ACTIVE` sites returns `409 CLIENT_HAS_ACTIVE_SITES` (checked inside the same transaction as the update).
- **`activeSiteCount`:** every client response includes the count of ACTIVE sites.
- **FIELD read (Task 11):** `GET /api/clients`, `GET /api/clients/:id`, and duplicates are allowed but scoped with `accessibleClientWhere` (clients that have a site in the user’s areas). Out-of-scope id → 404. `POST`/`PATCH` remain 403 for FIELD.

## Seed scripts

| Script | Purpose |
|--------|---------|
| `apps/api/scripts/seed-dev-clients.ts` | ~30 realistic Bulgarian dev clients (similar names, one archived, valid public EIKs). Idempotent: full insert when empty; when rows exist, **upsert companies by EIK** only. |
| `apps/api/scripts/seed-perf-clients.ts` | **Performance only** — 5,000 clients, timed search, `EXPLAIN (ANALYZE, BUFFERS)`, writes `docs/evidence/task-10/perf-explain.json`. Not for routine dev DBs. |

Run (from repo root):

```bash
pnpm --filter @ddcrm/api exec tsx scripts/seed-dev-clients.ts
pnpm --filter @ddcrm/api exec tsx scripts/seed-perf-clients.ts
```