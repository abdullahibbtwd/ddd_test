# Agreements — Task 19

## Model

One row per **signing**. Renewal creates a **new** row with `previous_agreement_id` pointing at the previous signing; dates shift (+1 year by default), same `contract_value` and `service_type`. Partial unique on `previous_agreement_id` enforces **one renewal per signing** (a chain, not a tree).

## Status

Stored: `ACTIVE | EXPIRED | TERMINATED | RENEWED`.

Computed display (`agreementStatus` helper): `TERMINATED` / `RENEWED` win (business decision); otherwise calendar `expires_at < asOf` → `EXPIRED`, else `ACTIVE`.

## Freeze

Once renewed (or not ACTIVE), the previous row is **frozen** — PATCH rejected (`AGREEMENT_FROZEN`). Second renew → `AGREEMENT_ALREADY_RENEWED` (409).

## Expiry queries

`GET /api/agreements/expiring?days=30` for Phase 11 notifications. No emails/bell in P10.
