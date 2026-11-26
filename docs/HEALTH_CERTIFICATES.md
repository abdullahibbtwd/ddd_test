# Health certificates — Task 19

## History model

A client employee holds multiple certificate rows over time. **Renewal = NEW row**; never UPDATE the previous row’s dates for a renewal. History is the row stack, newest first.

Each row: `last_certified_at`, `next_renewal_at`, notes, optional `document_file_id`.

## Status (computed only)

`CertificateStatus`: `CURRENT | EXPIRING | EXPIRED` — never stored. EXPIRED when `next_renewal_at < asOf`; EXPIRING when within 30 days; else CURRENT.

Date corrections via PATCH are allowed (mistakes); they are not a renewal path.

## P11 query

`GET /api/health-certificates/expiring?days=30` — certificates within N days of today (Sofia), employee not erased.

## No EGN

Standing decision — see `docs/PII.md`.
