-- Enums
CREATE TYPE "VisitStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "EmployeeRoleOnVisit" AS ENUM ('LEAD', 'ASSIST');

-- visits
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "treatment_type" "ServiceType" NOT NULL,
    "charged_amount" NUMERIC(12,2) NOT NULL,
    "rate_includes_vat" BOOLEAN NOT NULL,
    "subscription_id" UUID,
    "notes" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "client_mutation_id" UUID NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "visits" ADD CONSTRAINT "visits_site_id_fkey"
  FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visits" ADD CONSTRAINT "visits_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visits" ADD CONSTRAINT "visits_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visits" ADD CONSTRAINT "visits_cancelled_by_fkey"
  FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visits" ADD CONSTRAINT "visits_charged_amount_nonnegative_chk"
  CHECK ("charged_amount" >= 0);

-- Cancelled-consistency: ACTIVE has no cancel fields; CANCELLED has all three.
ALTER TABLE "visits" ADD CONSTRAINT "visits_cancel_consistency_chk"
  CHECK (
    ("status" = 'ACTIVE' AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL
      AND "cancel_reason" IS NOT NULL AND length(trim("cancel_reason")) >= 3)
  );

-- No future visit_date relative to created_at in Europe/Sofia.
ALTER TABLE "visits" ADD CONSTRAINT "visits_visit_date_not_future_chk"
  CHECK ("visit_date" <= (("created_at" AT TIME ZONE 'Europe/Sofia')::date));

CREATE UNIQUE INDEX "visits_created_by_client_mutation_id_key"
  ON "visits" ("created_by", "client_mutation_id");

CREATE INDEX "visits_site_id_visit_date_idx"
  ON "visits" ("site_id", "visit_date" DESC);

CREATE INDEX "visits_created_by_created_at_idx"
  ON "visits" ("created_by", "created_at");

CREATE INDEX "visits_subscription_id_idx"
  ON "visits" ("subscription_id");

-- visit_employees (own id for audit_attach; unique on visit+user)
CREATE TABLE "visit_employees" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_on_visit" "EmployeeRoleOnVisit" NOT NULL,

    CONSTRAINT "visit_employees_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "visit_employees" ADD CONSTRAINT "visit_employees_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visit_employees" ADD CONSTRAINT "visit_employees_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "visit_employees_visit_id_user_id_key"
  ON "visit_employees" ("visit_id", "user_id");

-- Subscription window: visit_date must fall in [start_date, end_date] of linked subscription.
CREATE OR REPLACE FUNCTION visits_subscription_window_guard()
RETURNS TRIGGER AS $$
DECLARE
  sub_start date;
  sub_end date;
BEGIN
  IF NEW.subscription_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT start_date, end_date INTO sub_start, sub_end
  FROM subscriptions
  WHERE id = NEW.subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'visits_subscription_window: subscription % not found', NEW.subscription_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.visit_date < sub_start OR (sub_end IS NOT NULL AND NEW.visit_date > sub_end) THEN
    RAISE EXCEPTION 'visits_subscription_window: visit_date % outside subscription % [% .. %]',
      NEW.visit_date, NEW.subscription_id, sub_start, sub_end
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_visits_subscription_window
BEFORE INSERT OR UPDATE OF visit_date, subscription_id ON visits
FOR EACH ROW
EXECUTE FUNCTION visits_subscription_window_guard();

-- Exactly one LEAD and at least one employee per visit (deferred to end of tx).
CREATE OR REPLACE FUNCTION visit_employees_lead_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_id uuid;
  lead_count int;
  total_count int;
BEGIN
  v_id := COALESCE(NEW.visit_id, OLD.visit_id);

  SELECT
    COUNT(*) FILTER (WHERE role_on_visit = 'LEAD'),
    COUNT(*)
  INTO lead_count, total_count
  FROM visit_employees
  WHERE visit_id = v_id;

  IF total_count < 1 THEN
    RAISE EXCEPTION 'visit_employees_lead: visit % must have at least one employee', v_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF lead_count <> 1 THEN
    RAISE EXCEPTION 'visit_employees_lead: visit % must have exactly one LEAD (found %)', v_id, lead_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_visit_employees_lead
AFTER INSERT OR UPDATE OR DELETE ON visit_employees
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION visit_employees_lead_guard();

-- After inserting a visit, require employees by end of transaction.
CREATE OR REPLACE FUNCTION visits_require_employees_guard()
RETURNS TRIGGER AS $$
DECLARE
  total_count int;
  lead_count int;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE role_on_visit = 'LEAD'),
    COUNT(*)
  INTO lead_count, total_count
  FROM visit_employees
  WHERE visit_id = NEW.id;

  IF total_count < 1 THEN
    RAISE EXCEPTION 'visits_require_employees: visit % must have at least one employee', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF lead_count <> 1 THEN
    RAISE EXCEPTION 'visits_require_employees: visit % must have exactly one LEAD (found %)', NEW.id, lead_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_visits_require_employees
AFTER INSERT ON visits
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION visits_require_employees_guard();

SELECT audit_attach('visits', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('visit_employees', ARRAY[]::text[], ARRAY[]::text[]);
