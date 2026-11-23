# Visits

Business overview of how visits work in DD CRM (Task 13).

## What a visit records

A visit is a field job at a **site** on a calendar **visit date** (Europe/Sofia
local `DATE`). It stores:

- treatment type (same `ServiceType` as subscriptions)
- one or more **employees** (exactly one `LEAD`, optional `ASSIST`)
- **charged amount** and whether it **includes VAT**
- optional link to the **subscription** it was recorded against
- optional notes
- status: `ACTIVE` or `CANCELLED`

There are no products, payments, or invoices on a visit in this phase.

## Snapshot vs live

When the site has a **current** subscription on the visit date, the API copies
`charged_amount` and `rate_includes_vat` from that subscription and sets
`subscription_id`. Changing the subscription’s rate later does **not** rewrite
existing visits — history keeps the amount that was charged that day.

One-off visits (no current subscription) require the user to enter the amount;
`subscription_id` stays null.

FIELD cannot override the copied amount/VAT. OFFICE/ADMIN may, until invoicing
exists (Phase 6).

## Lifecycle

1. **Create** — from the site drawer «Посещения» tab → full-screen form
   (`/visits/new`). Mobile-first; not a drawer.
2. **Edit** — `/visits/:id/edit`. FIELD may edit **own** visits within **24 hours**
   of `created_at`. OFFICE/ADMIN may edit until the visit is invoiced (stub:
   always false until Phase 6).
3. **Cancel** — never delete. Cancel sets `status=CANCELLED`, `cancelled_at`,
   `cancelled_by`, and a required `cancel_reason` (≥ 3 characters). Cancelled
   visits stay in history, struck through with the reason.

## Windows (FIELD)

| Rule | Meaning |
|---|---|
| Visit date | From 7 days before today (Sofia) through today. No future dates. |
| Edit / cancel | Within 24 hours of `created_at` (absolute UTC instant — DST-safe). |

OFFICE/ADMIN may backdate freely. The database also rejects any future
`visit_date` relative to `created_at` in Europe/Sofia.

## Idempotent saving

Every create carries `clientMutationId` (UUID). Unique index on
`(created_by, client_mutation_id)`: first create → **201**; identical retry →
**200** with the same row; different body → **409**
`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY`.

## Deliberately not in Task 13

- Schedule status / “This Month” / calendar
- Products, payments, invoices, notifications
- Offline queue
- Edit-history table or soft-delete column beyond `status`
