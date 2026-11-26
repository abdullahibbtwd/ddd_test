-- Task 16 (part 1): add CANCELLED_BY_CREDIT_NOTE to InvoiceStatus.
-- Must commit before the value is referenced (Postgres enum ADD VALUE rule).

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED_BY_CREDIT_NOTE';
