# Personal data (PII) — Task 19

## What is stored

Client employees hold **name**, optional **job title**, optional **site**, optional **notes**, and a stack of **health certificates** (dates, notes, optional document file).

**No EGN** (personal national ID) is stored — standing project decision. Identification is name + job title + site.

Food sample records do **not** link to a client employee as sampler in P10.

## Who can read

| Role | Access |
|---|---|
| ADMIN / OFFICE | Full CRUD on employees and certificates; export JSON; ADMIN-only erasure |
| FIELD | Redacted site view only: `GET /api/sites/:siteId/certified-employees` — **names + nextRenewalAt + computed status**, job title always `[скрито]`, no notes |

## Read auditing

Every read of `client_employees` or `health_certificates` writes a **READ_PII** audit event (actor, table, entity id(s), timestamp). Implemented via an explicit helper called from the read services (not Prisma middleware). **If the audit write fails, the read fails** with `READ_PII_AUDIT_FAILED` (500) — no silent skip.

Batching: **one event per request** with `meta.entityIds` listing all rows read.

Agreements and food sampling are **not** READ_PII-audited (business records).

## Export

`GET /api/client-employees/:id/export` (ADMIN, OFFICE) returns JSON: employee + certificate history. Writes an **EXPORT** audit event. No food samples (no employee link). No certificate PDF in P10.

## Erasure

`POST /api/client-employees/:id/erase` (ADMIN, reason ≥ 3 chars) **anonymizes** — does not delete. `full_name` / `job_title` → `[изтрито]`, notes cleared, certificate `document_file_id` nulled and stored files removed. Rows kept for referential integrity. Writes **ERASED**. DB CHECK rejects partial anonymization.

## Not in P10

Renewal/expiry notifications (Phase 11), document OCR, certificate PDF export.
