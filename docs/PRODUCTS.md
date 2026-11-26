# Products (Phase 9 / Task 18)

## Register

Products are master data. Rows are never deleted — archive with `archived = true`. Audit_attach covers the table; archival is a status change (no reason field required).

Active product names are unique (partial unique index where `archived = false`). An archived name may be reused.

## Active substances

Stored as `TEXT[]`. Shown in the register, pickers, and service reports. Report helper de-dupes across products while preserving first-seen order.

## Visit link

`visit_products` links a visit to a product (`quantity`, `unit`, optional `notes`).

- A visit may have zero or many products.
- **One row per product per visit** (`UNIQUE (visit_id, product_id)`). If the same product is added again before freeze, the API **sums** quantity into the existing row (not an error).
- Default unit comes from the product’s `default_unit` when the picker selects it.

## Freeze rule

Editable while the visit’s linked invoice is absent or `DRAFT`. Frozen when the invoice is `ISSUED` (or cancelled-by-credit-note). Enforced in the DB with BEFORE triggers → SQLSTATE `23P04` → `VISIT_PRODUCTS_FROZEN`.

Pre-freeze DELETE of a link row is a real DELETE (mistaken add has no lasting audit meaning as a soft status). Contrast with payments (INSERT-only).

Archived products cannot be added (`PRODUCT_ARCHIVED` 409).
