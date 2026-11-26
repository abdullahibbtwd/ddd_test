# Payments (Phase 8)

Business model for office readers. Technical details: [DATABASE.md](./DATABASE.md), [QUEUES.md](./QUEUES.md), [PERMISSIONS.md](./PERMISSIONS.md).

## Payment model

- Payments are **additive rows**. There is no stored balance column on the invoice.
- Outstanding = `gross_amount − Σ payments` (computed in SQL / shared helpers).
- Partial payments = multiple rows. Paying exactly the outstanding closes to zero.
- Overpayments are **rejected** (`PAYMENT_EXCEEDS_OUTSTANDING`). A future credit-balance feature would be separate — not in Phase 8.
- **Paid is not a status.** Invoice status stays `ISSUED`. “Платена” is a computed classification when outstanding is zero. This keeps issued financial columns immutable.
- Methods: `CASH` | `BANK_TRANSFER` | `CARD`. Only CASH has `collected_by_user_id` (required).
- Payments are **INSERT-only** (no UPDATE/DELETE). Mistakes are handled manually in the office for now.

## Cash handovers

- Separate `cash_handovers` table — not a flag on payments.
- Employee outstanding cash = Σ CASH payments collected by them − Σ handovers.
- A handover **may exceed** current outstanding (over-handed). Negative outstanding is valid and shown as «Надпредадено» in the ledger. There is no `HANDOVER_EXCEEDS_AVAILABLE` error.

## Due date and overdue

- `due_date` is set when the invoice is issued (`issued date + 30` days, Sofia calendar). Drafts have `NULL`.
- Credit/debit notes inherit the original’s due date.
- Overdue = status `ISSUED`, outstanding > 0, `due_date < today` (Sofia).
- Unpaid current = issued, outstanding > 0, not overdue.

## Reminders

- Queued emails via BullMQ queue `payment-reminder` (not the in-app notification bell — that is Phase 11).
- Overdue invoices can be reminded without confirmation. Unpaid-current requires `force: true`.
- History lives in `email_events` with `kind = REMINDER`.

## FIELD payments

- FIELD records CASH against a visit they created, only when that visit already has an invoice (`POST /api/visits/:visitId/payments`).
- FIELD sees only their own cash ledger. They cannot open `/payments` (outstanding report) or hand over cash.

## Deliberately not modelled in Phase 8

| Gap | Intended future |
|---|---|
| Payment reversals / refunds | Reversal row referencing the original payment (P13 polish) |
| Prepayment before invoice | Tracker **Q20** — assume always against an issued invoice for now |
| Fiscal receipts / device | Out of scope until client confirms |
| НАП / e-invoicing / accounting sync | Later phases |
| In-app notification bell | Phase 11 |
