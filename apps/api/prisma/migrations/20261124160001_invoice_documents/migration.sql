-- Task 16 (part 2): invoice documents — credit/debit notes, email events,
-- batch billing_month, extended immutability (operational columns + credit-note
-- cancellation). Depends on 20261124160000_invoice_status_cancelled.

-- Temporarily disable issued-immutability so additive column backfills can run.
-- The extended trigger is reinstalled later in this migration.
DROP TRIGGER IF EXISTS trg_invoices_reject_issued_mutation ON invoices;

-- Enums
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- New columns on invoices
ALTER TABLE "invoices"
  ADD COLUMN "document_type" "DocumentType" NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "references_invoice_id" UUID,
  ADD COLUMN "credit_note_reason" TEXT,
  ADD COLUMN "email_sent_at" TIMESTAMPTZ,
  ADD COLUMN "email_last_error" TEXT,
  ADD COLUMN "client_email" TEXT,
  ADD COLUMN "client_phone" TEXT,
  ADD COLUMN "billing_month" DATE,
  ADD COLUMN "site_id" UUID;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_references_invoice_id_fkey"
  FOREIGN KEY ("references_invoice_id") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_site_id_fkey"
  FOREIGN KEY ("site_id") REFERENCES "sites"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill billing_month for existing INVOICE rows (first of issued_at month, else created_at).
UPDATE "invoices"
SET "billing_month" = date_trunc(
  'month',
  COALESCE("issued_at", "created_at") AT TIME ZONE 'Europe/Sofia'
)::date
WHERE "document_type" = 'INVOICE' AND "billing_month" IS NULL;

-- Drop and recreate draft/issued consistency to include CANCELLED_BY_CREDIT_NOTE
-- and optional client_email / client_phone on issued snapshots.
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_draft_issued_consistency_chk";

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_draft_issued_consistency_chk"
  CHECK (
    (
      "status" = 'DRAFT'
      AND "number" IS NULL
      AND "issued_at" IS NULL
      AND "issued_by" IS NULL
      AND "client_legal_name" IS NULL
      AND "client_eik" IS NULL
      AND "client_vat_number" IS NULL
      AND "client_registered_address" IS NULL
      AND "client_legal_representative" IS NULL
      AND "client_email" IS NULL
      AND "client_phone" IS NULL
    )
    OR
    (
      "status" IN ('ISSUED', 'CANCELLED_BY_CREDIT_NOTE')
      AND "number" IS NOT NULL
      AND "issued_at" IS NOT NULL
      AND "issued_by" IS NOT NULL
      AND "client_legal_name" IS NOT NULL
      AND "client_eik" IS NOT NULL
      AND "client_vat_number" IS NOT NULL
      AND "client_registered_address" IS NOT NULL
      AND "client_legal_representative" IS NOT NULL
    )
  );

-- Document-type / reference consistency
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_document_type_refs_chk"
  CHECK (
    ("document_type" = 'INVOICE' AND "references_invoice_id" IS NULL)
    OR
    ("document_type" IN ('CREDIT_NOTE', 'DEBIT_NOTE') AND "references_invoice_id" IS NOT NULL)
  );

-- Credit-note reason required only for CREDIT_NOTE
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_note_reason_chk"
  CHECK (
    (
      "document_type" = 'CREDIT_NOTE'
      AND "credit_note_reason" IS NOT NULL
      AND length(trim("credit_note_reason")) >= 3
    )
    OR
    (
      "document_type" <> 'CREDIT_NOTE'
      AND "credit_note_reason" IS NULL
    )
  );

-- billing_month required for INVOICE, null for notes
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_month_chk"
  CHECK (
    ("document_type" = 'INVOICE' AND "billing_month" IS NOT NULL)
    OR
    ("document_type" <> 'INVOICE' AND "billing_month" IS NULL)
  );

-- One CREDIT_NOTE per referenced invoice
CREATE UNIQUE INDEX "invoices_one_credit_note_per_invoice_uidx"
  ON "invoices" ("references_invoice_id")
  WHERE "document_type" = 'CREDIT_NOTE';

-- Batch idempotency: one INVOICE per (site_id, billing_month) when site-scoped
CREATE UNIQUE INDEX "invoices_site_billing_month_uidx"
  ON "invoices" ("site_id", "billing_month")
  WHERE "document_type" = 'INVOICE' AND "site_id" IS NOT NULL;

CREATE INDEX "invoices_document_type_idx" ON "invoices" ("document_type");
CREATE INDEX "invoices_references_invoice_id_idx" ON "invoices" ("references_invoice_id");
CREATE INDEX "invoices_billing_month_idx" ON "invoices" ("billing_month");
CREATE INDEX "invoices_site_id_idx" ON "invoices" ("site_id");

-- ---------------------------------------------------------------------------
-- email_events
-- ---------------------------------------------------------------------------

CREATE TABLE "email_events" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "to_address" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "error" TEXT,
    "job_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_events" ADD CONSTRAINT "email_events_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "email_events_invoice_id_created_at_idx"
  ON "email_events" ("invoice_id", "created_at" DESC);

CREATE UNIQUE INDEX "email_events_job_id_key" ON "email_events" ("job_id");

-- ---------------------------------------------------------------------------
-- Extended immutability trigger
-- Operational columns always allowed on ISSUED / CANCELLED_BY_CREDIT_NOTE:
--   email_sent_at, email_last_error, updated_at
-- Credit-note cancellation: ISSUED → CANCELLED_BY_CREDIT_NOTE when a CREDIT_NOTE
-- row referencing this invoice exists in the same transaction; only status +
-- updated_at may change for that path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoices_reject_issued_mutation()
RETURNS TRIGGER AS $$
DECLARE
  only_operational boolean;
  only_status_cancel boolean;
  has_credit_note boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ISSUED', 'CANCELLED_BY_CREDIT_NOTE') THEN
      RAISE EXCEPTION 'invoices: issued invoice % is immutable', OLD.id
        USING ERRCODE = '23P02';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status NOT IN ('ISSUED', 'CANCELLED_BY_CREDIT_NOTE') THEN
    RETURN NEW;
  END IF;

  only_operational :=
    NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.number IS NOT DISTINCT FROM OLD.number
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
    AND NEW.issued_at IS NOT DISTINCT FROM OLD.issued_at
    AND NEW.issued_by IS NOT DISTINCT FROM OLD.issued_by
    AND NEW.client_legal_name IS NOT DISTINCT FROM OLD.client_legal_name
    AND NEW.client_eik IS NOT DISTINCT FROM OLD.client_eik
    AND NEW.client_vat_number IS NOT DISTINCT FROM OLD.client_vat_number
    AND NEW.client_registered_address IS NOT DISTINCT FROM OLD.client_registered_address
    AND NEW.client_legal_representative IS NOT DISTINCT FROM OLD.client_legal_representative
    AND NEW.client_email IS NOT DISTINCT FROM OLD.client_email
    AND NEW.client_phone IS NOT DISTINCT FROM OLD.client_phone
    AND NEW.currency IS NOT DISTINCT FROM OLD.currency
    AND NEW.net_amount IS NOT DISTINCT FROM OLD.net_amount
    AND NEW.vat_amount IS NOT DISTINCT FROM OLD.vat_amount
    AND NEW.gross_amount IS NOT DISTINCT FROM OLD.gross_amount
    AND NEW.notes IS NOT DISTINCT FROM OLD.notes
    AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    AND NEW.document_type IS NOT DISTINCT FROM OLD.document_type
    AND NEW.references_invoice_id IS NOT DISTINCT FROM OLD.references_invoice_id
    AND NEW.credit_note_reason IS NOT DISTINCT FROM OLD.credit_note_reason
    AND NEW.billing_month IS NOT DISTINCT FROM OLD.billing_month
    AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id;
  -- email_sent_at / email_last_error / updated_at may differ

  IF only_operational THEN
    RETURN NEW;
  END IF;

  -- Credit-note cancellation path (ISSUED → CANCELLED_BY_CREDIT_NOTE)
  IF OLD.status = 'ISSUED' AND NEW.status = 'CANCELLED_BY_CREDIT_NOTE' THEN
    only_status_cancel :=
      NEW.id IS NOT DISTINCT FROM OLD.id
      AND NEW.number IS NOT DISTINCT FROM OLD.number
      AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
      AND NEW.issued_at IS NOT DISTINCT FROM OLD.issued_at
      AND NEW.issued_by IS NOT DISTINCT FROM OLD.issued_by
      AND NEW.client_legal_name IS NOT DISTINCT FROM OLD.client_legal_name
      AND NEW.client_eik IS NOT DISTINCT FROM OLD.client_eik
      AND NEW.client_vat_number IS NOT DISTINCT FROM OLD.client_vat_number
      AND NEW.client_registered_address IS NOT DISTINCT FROM OLD.client_registered_address
      AND NEW.client_legal_representative IS NOT DISTINCT FROM OLD.client_legal_representative
      AND NEW.client_email IS NOT DISTINCT FROM OLD.client_email
      AND NEW.client_phone IS NOT DISTINCT FROM OLD.client_phone
      AND NEW.currency IS NOT DISTINCT FROM OLD.currency
      AND NEW.net_amount IS NOT DISTINCT FROM OLD.net_amount
      AND NEW.vat_amount IS NOT DISTINCT FROM OLD.vat_amount
      AND NEW.gross_amount IS NOT DISTINCT FROM OLD.gross_amount
      AND NEW.notes IS NOT DISTINCT FROM OLD.notes
      AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
      AND NEW.document_type IS NOT DISTINCT FROM OLD.document_type
      AND NEW.references_invoice_id IS NOT DISTINCT FROM OLD.references_invoice_id
      AND NEW.credit_note_reason IS NOT DISTINCT FROM OLD.credit_note_reason
      AND NEW.billing_month IS NOT DISTINCT FROM OLD.billing_month
      AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id
      AND NEW.email_sent_at IS NOT DISTINCT FROM OLD.email_sent_at
      AND NEW.email_last_error IS NOT DISTINCT FROM OLD.email_last_error;

    IF only_status_cancel THEN
      SELECT EXISTS (
        SELECT 1 FROM invoices
        WHERE references_invoice_id = OLD.id
          AND document_type = 'CREDIT_NOTE'
          AND status = 'ISSUED'
          AND id <> OLD.id
      ) INTO has_credit_note;

      IF has_credit_note THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'invoices: issued invoice % is immutable', OLD.id
    USING ERRCODE = '23P02';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_reject_issued_mutation ON invoices;
CREATE TRIGGER trg_invoices_reject_issued_mutation
BEFORE UPDATE OR DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION invoices_reject_issued_mutation();

-- Replace lines trigger to treat CANCELLED_BY_CREDIT_NOTE as immutable too
CREATE OR REPLACE FUNCTION invoice_lines_reject_issued_mutation()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "InvoiceStatus";
  parent_id uuid;
BEGIN
  parent_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT status INTO parent_status
  FROM invoices
  WHERE id = parent_id;

  IF parent_status IN ('ISSUED', 'CANCELLED_BY_CREDIT_NOTE') THEN
    RAISE EXCEPTION 'invoice_lines: parent invoice % is issued and immutable', parent_id
      USING ERRCODE = '23P02';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- AFTER INSERT: issuing a CREDIT_NOTE cancels the referenced invoice
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoices_after_insert_credit_note()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.document_type = 'CREDIT_NOTE' AND NEW.status = 'ISSUED' AND NEW.references_invoice_id IS NOT NULL THEN
    UPDATE invoices
    SET
      status = 'CANCELLED_BY_CREDIT_NOTE',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.references_invoice_id
      AND status = 'ISSUED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_after_insert_credit_note ON invoices;
CREATE TRIGGER trg_invoices_after_insert_credit_note
AFTER INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION invoices_after_insert_credit_note();

-- Audit
SELECT audit_attach('email_events', ARRAY[]::text[], ARRAY[]::text[]);
