-- Invoices core (Task 15): draft/issue, gapless counter, issued immutability.
-- SQLSTATE '23P02' is an unused integrity-constraint class used for issued-invoice
-- immutability (BEFORE UPDATE/DELETE). The API maps it to INVOICE_IMMUTABLE.

-- Enums
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED');

-- Gapless number counter (singleton row; NOT a Postgres sequence).
CREATE TABLE "invoice_counters" (
    "id" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_counters_next_value_chk" CHECK ("next_value" >= 1)
);

INSERT INTO "invoice_counters" ("id", "next_value") VALUES ('default', 1);

-- invoices
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "client_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ,
    "issued_by" UUID,
    "client_legal_name" TEXT,
    "client_eik" TEXT,
    "client_vat_number" TEXT,
    "client_registered_address" TEXT,
    "client_legal_representative" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "net_amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "vat_amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "gross_amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_fkey"
  FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Draft vs issued consistency (six snapshot cols + number/issue metadata).
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
    )
    OR
    (
      "status" = 'ISSUED'
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

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_gross_eq_net_plus_vat_chk"
  CHECK ("gross_amount" = "net_amount" + "vat_amount");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_nonnegative_chk"
  CHECK (
    "net_amount" >= 0
    AND "vat_amount" >= 0
    AND "gross_amount" >= 0
  );

CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" ("number");

CREATE INDEX "invoices_client_id_idx" ON "invoices" ("client_id");

CREATE INDEX "invoices_status_issued_at_idx"
  ON "invoices" ("status", "issued_at" DESC);

-- invoice_lines
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" NUMERIC(12,3) NOT NULL,
    "unit_price" NUMERIC(12,2) NOT NULL,
    "vat_rate" NUMERIC(5,2) NOT NULL,
    "line_total" NUMERIC(12,2) NOT NULL,
    "vat_amount" NUMERIC(12,2) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_line_no_positive_chk"
  CHECK ("line_no" >= 1);

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_quantity_positive_chk"
  CHECK ("quantity" > 0);

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_unit_price_nonnegative_chk"
  CHECK ("unit_price" >= 0);

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_vat_rate_range_chk"
  CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_amounts_nonnegative_chk"
  CHECK ("line_total" >= 0 AND "vat_amount" >= 0);

CREATE UNIQUE INDEX "invoice_lines_invoice_id_line_no_key"
  ON "invoice_lines" ("invoice_id", "line_no");

-- invoice_visit
-- Own UUID PK so audit_attach has a stable entity id (same pattern as visit_employees).
-- Business uniqueness: UNIQUE(invoice_id, visit_id) and UNIQUE(visit_id).
CREATE TABLE "invoice_visit" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,

    CONSTRAINT "invoice_visit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoice_visit" ADD CONSTRAINT "invoice_visit_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_visit" ADD CONSTRAINT "invoice_visit_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "invoice_visit_invoice_id_visit_id_key"
  ON "invoice_visit" ("invoice_id", "visit_id");

CREATE UNIQUE INDEX "invoice_visit_visit_id_key"
  ON "invoice_visit" ("visit_id");

-- ---------------------------------------------------------------------------
-- Issued immutability (SQLSTATE 23P02 — unused integrity class; see header).
-- BEFORE UPDATE/DELETE so a blocked change never reaches AFTER audit triggers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoices_reject_issued_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'ISSUED' THEN
      RAISE EXCEPTION 'invoices: issued invoice % is immutable', OLD.id
        USING ERRCODE = '23P02';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status = 'ISSUED' THEN
    RAISE EXCEPTION 'invoices: issued invoice % is immutable', OLD.id
      USING ERRCODE = '23P02';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_reject_issued_mutation
BEFORE UPDATE OR DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION invoices_reject_issued_mutation();

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

  IF parent_status = 'ISSUED' THEN
    RAISE EXCEPTION 'invoice_lines: parent invoice % is issued and immutable', parent_id
      USING ERRCODE = '23P02';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_lines_reject_issued_mutation
BEFORE UPDATE OR DELETE ON invoice_lines
FOR EACH ROW
EXECUTE FUNCTION invoice_lines_reject_issued_mutation();

-- ---------------------------------------------------------------------------
-- Maintain invoice totals from lines while the parent is DRAFT.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoice_lines_maintain_totals()
RETURNS TRIGGER AS $$
DECLARE
  parent_id uuid;
  parent_status "InvoiceStatus";
  sum_net numeric(12,2);
  sum_vat numeric(12,2);
BEGIN
  parent_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT status INTO parent_status
  FROM invoices
  WHERE id = parent_id;

  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(vat_amount), 0)
  INTO sum_net, sum_vat
  FROM invoice_lines
  WHERE invoice_id = parent_id;

  UPDATE invoices
  SET
    net_amount = sum_net,
    vat_amount = sum_vat,
    gross_amount = sum_net + sum_vat,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = parent_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_lines_maintain_totals
AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
FOR EACH ROW
EXECUTE FUNCTION invoice_lines_maintain_totals();

-- Audit
SELECT audit_attach('invoices', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('invoice_lines', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('invoice_visit', ARRAY[]::text[], ARRAY[]::text[]);
