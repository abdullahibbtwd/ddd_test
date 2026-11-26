-- Task 17 (Phase 8): payments, cash handovers, invoice due_date, email_events.kind,
-- payment/handover immutability triggers, overpay guard (23P03).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "EmailEventKind" AS ENUM ('INVOICE', 'REMINDER');

-- ---------------------------------------------------------------------------
-- email_events.kind (default INVOICE so existing rows stay valid)
-- ---------------------------------------------------------------------------

ALTER TABLE "email_events"
  ADD COLUMN "kind" "EmailEventKind" NOT NULL DEFAULT 'INVOICE';

-- ---------------------------------------------------------------------------
-- invoices.due_date
-- Temporarily drop issued-immutability so backfill + CHECK can land; reinstall
-- the extended trigger (with due_date in equality lists) below.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_invoices_reject_issued_mutation ON invoices;

ALTER TABLE "invoices"
  ADD COLUMN "due_date" DATE;

UPDATE "invoices"
SET "due_date" = (("issued_at" AT TIME ZONE 'Europe/Sofia')::date + 30)
WHERE "status" <> 'DRAFT' AND "due_date" IS NULL;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_due_date_chk"
  CHECK (
    ("status" = 'DRAFT' AND "due_date" IS NULL)
    OR
    ("status" <> 'DRAFT' AND "due_date" IS NOT NULL)
  );

CREATE INDEX "invoices_due_date_idx" ON "invoices" ("due_date");

-- ---------------------------------------------------------------------------
-- Extended immutability: due_date must not change after issue.
-- DRAFT rows remain freely updatable (issue sets due_date in the same UPDATE).
-- Operational allowlist still: email_sent_at, email_last_error, updated_at.
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
    AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id
    AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date;
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
      AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
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

CREATE TRIGGER trg_invoices_reject_issued_mutation
BEFORE UPDATE OR DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION invoices_reject_issued_mutation();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" NUMERIC(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" DATE NOT NULL,
    "collected_by_user_id" UUID,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_positive_chk" CHECK ("amount" > 0),
    CONSTRAINT "payments_method_allowed_chk" CHECK (
      "method" IN ('CASH', 'BANK_TRANSFER', 'CARD')
    ),
    CONSTRAINT "payments_cash_collector_chk" CHECK (
      ("method" = 'CASH' AND "collected_by_user_id" IS NOT NULL)
      OR
      ("method" <> 'CASH' AND "collected_by_user_id" IS NULL)
    ),
    CONSTRAINT "payments_paid_at_not_future_chk" CHECK (
      "paid_at" <= (now() AT TIME ZONE 'Europe/Sofia')::date
    )
);

ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_collected_by_user_id_fkey"
  FOREIGN KEY ("collected_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payments_invoice_id_idx" ON "payments" ("invoice_id");
CREATE INDEX "payments_collected_by_paid_at_idx"
  ON "payments" ("collected_by_user_id", "paid_at");
CREATE INDEX "payments_paid_at_idx" ON "payments" ("paid_at");

-- Overpay + immutability (SQLSTATE 23P03 overpay, 23P02 immutable)
CREATE OR REPLACE FUNCTION payments_guard()
RETURNS TRIGGER AS $$
DECLARE
  inv_gross numeric(12,2);
  inv_status "InvoiceStatus";
  paid_sum numeric(12,2);
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments: payment rows are immutable'
      USING ERRCODE = '23P02';
  END IF;

  -- INSERT
  SELECT gross_amount, status INTO inv_gross, inv_status
  FROM invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payments: invoice % not found', NEW.invoice_id
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO paid_sum
  FROM payments
  WHERE invoice_id = NEW.invoice_id;

  IF paid_sum + NEW.amount > inv_gross THEN
    RAISE EXCEPTION
      'payments: amount would exceed outstanding (paid=% + new=% > gross=%)',
      paid_sum, NEW.amount, inv_gross
      USING ERRCODE = '23P03';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_guard
BEFORE INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION payments_guard();

-- ---------------------------------------------------------------------------
-- cash_handovers (no balance check — over-handover is legal)
-- ---------------------------------------------------------------------------

CREATE TABLE "cash_handovers" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "amount" NUMERIC(12,2) NOT NULL,
    "handed_over_at" DATE NOT NULL,
    "received_by_user_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "cash_handovers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_handovers_amount_positive_chk" CHECK ("amount" > 0),
    CONSTRAINT "cash_handovers_handed_over_at_not_future_chk" CHECK (
      "handed_over_at" <= (now() AT TIME ZONE 'Europe/Sofia')::date
    )
);

ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_received_by_user_id_fkey"
  FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "cash_handovers_employee_handed_over_at_idx"
  ON "cash_handovers" ("employee_id", "handed_over_at");
CREATE INDEX "cash_handovers_handed_over_at_idx"
  ON "cash_handovers" ("handed_over_at");

CREATE OR REPLACE FUNCTION cash_handovers_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cash_handovers: handover rows are immutable'
      USING ERRCODE = '23P02';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cash_handovers_reject_mutation
BEFORE UPDATE OR DELETE ON cash_handovers
FOR EACH ROW
EXECUTE FUNCTION cash_handovers_reject_mutation();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

SELECT audit_attach('payments', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('cash_handovers', ARRAY[]::text[], ARRAY[]::text[]);
