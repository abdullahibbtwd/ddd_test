# Service reports (Phase 9 / Task 18)

Business reader. One report per visit; no separate numbering series in P9.

## What a report contains

Common legal core (Bulgarian throughout):

- Supplier block (same config as invoice PDFs)
- Site name / address / client
- Visit date
- Employees (LEAD first)
- Treatment type label
- Products table (name, formulation / prominent field, active substances, quantity, unit, recommendations)
- NEOT/POT checks summary (count checked, counts by status)
- Recommendations block (from products, de-duplicated)
- Signature lines (client representative / employee)

Treatment-type layout differs only in headings and which product fields are shown prominently (e.g. rodent control highlights active substances). The legal core is the same for insect control, rodent control, disinfection, and other.

If the visit has no products, the table shows a muted line: **без използвани препарати**.

## Minimum data

Required to generate: **site**, **visit_date**, **treatment_type**, **at least one employee**.

Products and point checks are optional. Missing minimum data → `REPORT_INSUFFICIENT_DATA` (422).

## Snapshot rule

When the visit’s linked invoice is **issued**, product fields are copied into `visits.visit_products_snapshot` (JSONB) inside the issue transaction. The PDF reads the snapshot if present; otherwise live `visit_products` ⨝ `products` (draft / not yet frozen).

There is **no** never-to-be-invoiced confirm path in this model — snapshots only on invoice issue.

## What P9 does not do

- No separate report numbering series
- No email of reports
- No photos on the report (or in point checks UI)
- No “report generated” flag / history / versioning table — generating multiple times yields the same PDF for the same frozen data
- PDFs are generated on demand (no disk storage), same rule as Task 16 invoices
