# Invoicing

Business overview of invoices, credit/debit notes, PDF, email, and batch
(Tasks 15–16 / Phases 6–7).

## Who can invoice

| Role | Access |
|---|---|
| ADMIN / OFFICE | Full: list, drafts, issue, PDF, email, credit/debit notes, batch |
| FIELD | **No** invoicing — nav item hidden; `/invoices*` redirects home |

Payments stay available to FIELD; invoicing does not. R-3.04 (FIELD issue) remains deferred.

## Document family

| `document_type` | Meaning |
|---|---|
| `INVOICE` | Ordinary invoice (draft → issued → optionally cancelled by credit note) |
| `CREDIT_NOTE` | New issued document that credits an issued invoice; cancels the original |
| `DEBIT_NOTE` | New issued document that adds a charge; original stays `ISSUED` |

All three share **one gapless number series** (`invoice_counters`).

## Lifecycle

1. **Draft** — editable lines; number empty (`Чернова`). Empty drafts allowed. `billing_month` required.
2. **Issue** — ≥1 line; next number; freezes client snapshot (incl. email/phone); immutable afterwards.
3. **Credit note** — new `ISSUED` document with `references_invoice_id` + required reason (≥3 chars). Same-tx trigger sets original `ISSUED` → `CANCELLED_BY_CREDIT_NOTE`. At most one credit note per invoice (partial UNIQUE).
4. **Debit note** — new `ISSUED` document; original stays `ISSUED`. Reason optional.
5. **Visits** — a visit may appear on at most one invoice.

### Status transitions (shared model + DB)

| From | To | Allowed when |
|---|---|---|
| `DRAFT` | `ISSUED` | Issue path |
| `ISSUED` | `CANCELLED_BY_CREDIT_NOTE` | Credit note row exists in the same tx; only `status` + `updated_at` change |
| anything else | — | Rejected (`23P02` / model test) |

### Immutability exceptions (operational columns)

On `ISSUED` / `CANCELLED_BY_CREDIT_NOTE`, only these columns may change freely:

- `email_sent_at`
- `email_last_error`
- `updated_at`

Legal/financial/snapshot columns never change after issue.

## PDF

- Rendered **only** from the issued snapshot + frozen `invoice_lines` (never live client/visit/subscription).
- `GET /api/invoices/:id/pdf?copy=0|1` — original vs copy are byte-identical except the fixed `ОРИГИНАЛ` / `КОПИЕ` stamp.
- Drafts → 404. PDFs are **not** stored on disk; regenerated on every GET/send.
- Supplier details: `apps/api/src/config/supplier.ts` (TODO Phase 13 settings; Q-accountant).

## Email

- Always **queued** (`invoice-email` BullMQ queue). Route returns **202** `{ jobId }`.
- Deterministic job id `invoice_email_<invoiceId>_<attempt>` prevents duplicate sends.
- Worker renders PDF from snapshot, attaches, sends via client SMTP.
- Failures retry with existing exponential backoff; final failure sets `email_last_error`.
- History in `email_events` (`GET …/email-events`).

## Batch invoicing

- `POST /api/invoices/batch` `{ month: YYYY-MM, areaId?, dryRun? }` → creates **DRAFT** invoices (never issues).
- One draft per ACTIVE site with a current subscription; auto-line from subscription rate/services.
- Idempotent by `(site_id, billing_month)` (partial unique).
- `POST /api/invoices/batch/issue` issues selected drafts **each in its own transaction**; partial failure does **not** roll back successes.

## Lines and VAT

- Per-line HALF_UP; invoice totals = sum of lines (`@ddcrm/shared` BigInt helpers).
- PDF shows **stored** invoice totals (authoritative snapshot).

## Deliberately NOT modelled (P7)

- Payments / outstanding balances / cash ledger → **P8**
- НАП / e-invoicing → out of scope
- Multiple numbering series → out of scope (one series by decision)
- Settings UI for supplier → Phase 13
- Storing PDFs on disk
- Synchronous PDF on JSON routes
- FIELD invoice access
