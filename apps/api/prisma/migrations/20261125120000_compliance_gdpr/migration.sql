-- Task 19 (Phase 10): health certificates, agreements, food sampling, GDPR.
-- No EGN column anywhere (standing decision).
-- No hard DELETE on these business tables (reject triggers below).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "AgreementStatus" AS ENUM (
  'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED'
);

CREATE TYPE "FoodResultStatus" AS ENUM (
  'PENDING', 'CONFORMING', 'NON_CONFORMING'
);

-- CertificateStatus is computed only — never stored.

-- ---------------------------------------------------------------------------
-- stored_files (minimal registry so document_file_id / result_file_id can FK)
-- Task 4 deferred a files table; P10 needs FK + erasure deletion.
-- ---------------------------------------------------------------------------

CREATE TABLE "stored_files" (
  "id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "original_filename" TEXT,
  "byte_size" INTEGER,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stored_files_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "stored_files_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- client_employees
-- ---------------------------------------------------------------------------

CREATE TABLE "client_employees" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "full_name" TEXT NOT NULL,
  "job_title" TEXT,
  "site_id" UUID,
  "notes" TEXT,
  "erased_at" TIMESTAMPTZ,
  "erased_by" UUID,
  "erase_reason" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "client_employees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_employees_full_name_chk"
    CHECK (length(trim("full_name")) >= 2),
  CONSTRAINT "client_employees_erasure_chk" CHECK (
    ("erased_at" IS NULL)
    OR (
      "erased_at" IS NOT NULL
      AND "erased_by" IS NOT NULL
      AND length(trim("erase_reason")) >= 3
      AND "full_name" = '[изтрито]'
      AND ("job_title" IS NULL OR "job_title" = '[изтрито]')
    )
  ),
  CONSTRAINT "client_employees_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_employees_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_employees_erased_by_fkey"
    FOREIGN KEY ("erased_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_employees_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "client_employees_client_id_erased_at_idx"
  ON "client_employees" ("client_id", "erased_at");
CREATE INDEX "client_employees_site_id_idx"
  ON "client_employees" ("site_id");

-- ---------------------------------------------------------------------------
-- health_certificates (renewal = NEW row; never UPDATE previous dates for renewal)
-- ---------------------------------------------------------------------------

CREATE TABLE "health_certificates" (
  "id" UUID NOT NULL,
  "client_employee_id" UUID NOT NULL,
  "last_certified_at" DATE NOT NULL,
  "next_renewal_at" DATE NOT NULL,
  "notes" TEXT,
  "document_file_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "health_certificates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "health_certificates_dates_chk"
    CHECK ("next_renewal_at" > "last_certified_at"),
  CONSTRAINT "health_certificates_client_employee_id_fkey"
    FOREIGN KEY ("client_employee_id") REFERENCES "client_employees"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "health_certificates_document_file_id_fkey"
    FOREIGN KEY ("document_file_id") REFERENCES "stored_files"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "health_certificates_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "health_certificates_employee_renewal_idx"
  ON "health_certificates" ("client_employee_id", "next_renewal_at");
CREATE INDEX "health_certificates_next_renewal_at_idx"
  ON "health_certificates" ("next_renewal_at");

-- ---------------------------------------------------------------------------
-- agreements (one renewal per signing via partial UNIQUE on previous_agreement_id)
-- ---------------------------------------------------------------------------

CREATE TABLE "agreements" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "service_type" "ServiceType" NOT NULL,
  "signed_at" DATE NOT NULL,
  "expires_at" DATE NOT NULL,
  "contract_value" NUMERIC(12,2) NOT NULL,
  "status" "AgreementStatus" NOT NULL DEFAULT 'ACTIVE',
  "previous_agreement_id" UUID,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "agreements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agreements_dates_chk" CHECK ("expires_at" > "signed_at"),
  CONSTRAINT "agreements_contract_value_chk" CHECK ("contract_value" >= 0),
  CONSTRAINT "agreements_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agreements_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agreements_previous_agreement_id_fkey"
    FOREIGN KEY ("previous_agreement_id") REFERENCES "agreements"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agreements_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- One renewal per signing (a chain, not a tree).
CREATE UNIQUE INDEX "agreements_previous_agreement_id_uidx"
  ON "agreements" ("previous_agreement_id")
  WHERE "previous_agreement_id" IS NOT NULL;

CREATE INDEX "agreements_site_id_expires_at_idx"
  ON "agreements" ("site_id", "expires_at");
CREATE INDEX "agreements_status_expires_at_idx"
  ON "agreements" ("status", "expires_at");
CREATE INDEX "agreements_client_id_idx"
  ON "agreements" ("client_id");

-- ---------------------------------------------------------------------------
-- food_sampling_schedules
-- ---------------------------------------------------------------------------

CREATE TABLE "food_sampling_schedules" (
  "id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "service_type" "ServiceType" NOT NULL,
  "cadence_months" INTEGER NOT NULL,
  "next_due_at" DATE NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "food_sampling_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "food_sampling_schedules_cadence_chk"
    CHECK ("cadence_months" BETWEEN 1 AND 24),
  CONSTRAINT "food_sampling_schedules_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "food_sampling_schedules_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "food_sampling_schedules_site_service_active_uidx"
  ON "food_sampling_schedules" ("site_id", "service_type")
  WHERE "active" = true;

CREATE INDEX "food_sampling_schedules_active_next_due_idx"
  ON "food_sampling_schedules" ("active", "next_due_at");
CREATE INDEX "food_sampling_schedules_site_id_idx"
  ON "food_sampling_schedules" ("site_id");

-- ---------------------------------------------------------------------------
-- food_sample_records (no client_employee / sampler link in P10)
-- ---------------------------------------------------------------------------

CREATE TABLE "food_sample_records" (
  "id" UUID NOT NULL,
  "schedule_id" UUID,
  "site_id" UUID NOT NULL,
  "collected_at" DATE NOT NULL,
  "sample_description" TEXT NOT NULL,
  "lab_name" TEXT,
  "result_received_at" DATE,
  "result_status" "FoodResultStatus" NOT NULL DEFAULT 'PENDING',
  "result_summary" TEXT,
  "result_file_id" UUID,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "food_sample_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "food_sample_records_description_chk"
    CHECK (length(trim("sample_description")) >= 2),
  CONSTRAINT "food_sample_records_result_chk" CHECK (
    ("result_status" = 'PENDING' AND "result_received_at" IS NULL)
    OR ("result_status" <> 'PENDING' AND "result_received_at" IS NOT NULL)
  ),
  CONSTRAINT "food_sample_records_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "food_sampling_schedules"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "food_sample_records_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "food_sample_records_result_file_id_fkey"
    FOREIGN KEY ("result_file_id") REFERENCES "stored_files"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "food_sample_records_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "food_sample_records_site_collected_idx"
  ON "food_sample_records" ("site_id", "collected_at" DESC);
CREATE INDEX "food_sample_records_result_status_idx"
  ON "food_sample_records" ("result_status", "result_received_at");

-- ---------------------------------------------------------------------------
-- Trigger: advance schedule next_due_at when a record is inserted with schedule_id
-- (truth; API does not double-update)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION food_sample_records_advance_schedule()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.schedule_id IS NOT NULL THEN
    UPDATE food_sampling_schedules
    SET
      next_due_at = (next_due_at + (cadence_months || ' months')::interval)::date,
      updated_at = now()
    WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_food_sample_records_advance_schedule
  AFTER INSERT ON food_sample_records
  FOR EACH ROW
  EXECUTE FUNCTION food_sample_records_advance_schedule();

-- ---------------------------------------------------------------------------
-- No-DELETE policy (business rows are never physically deleted)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compliance_reject_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE rejected on % (no hard delete)', TG_TABLE_NAME
    USING ERRCODE = '23P06';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_employees_no_delete
  BEFORE DELETE ON client_employees
  FOR EACH ROW EXECUTE FUNCTION compliance_reject_delete();

CREATE TRIGGER trg_health_certificates_no_delete
  BEFORE DELETE ON health_certificates
  FOR EACH ROW EXECUTE FUNCTION compliance_reject_delete();

CREATE TRIGGER trg_agreements_no_delete
  BEFORE DELETE ON agreements
  FOR EACH ROW EXECUTE FUNCTION compliance_reject_delete();

CREATE TRIGGER trg_food_sampling_schedules_no_delete
  BEFORE DELETE ON food_sampling_schedules
  FOR EACH ROW EXECUTE FUNCTION compliance_reject_delete();

CREATE TRIGGER trg_food_sample_records_no_delete
  BEFORE DELETE ON food_sample_records
  FOR EACH ROW EXECUTE FUNCTION compliance_reject_delete();

-- ---------------------------------------------------------------------------
-- audit_attach
-- ---------------------------------------------------------------------------

SELECT audit_attach('client_employees', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('health_certificates', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('agreements', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('food_sampling_schedules', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('food_sample_records', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('stored_files', ARRAY[]::text[], ARRAY[]::text[]);
