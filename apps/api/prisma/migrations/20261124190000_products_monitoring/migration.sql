-- Task 18 (Phase 9): products, visit_products, monitoring points/checks,
-- visit_products_snapshot, freeze triggers (23P04), point-in-site (23P05),
-- monitoring_points_count sync trigger, snapshot-on-invoice-issue.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "ProductFormulation" AS ENUM (
  'LIQUID', 'POWDER', 'GEL', 'BAIT', 'TRAP', 'AEROSOL', 'OTHER'
);

CREATE TYPE "MeasurementUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'PIECE');

CREATE TYPE "MonitoringPointType" AS ENUM ('NEOT', 'POT');

CREATE TYPE "MonitoringPointStatus" AS ENUM (
  'OK', 'ACTIVITY', 'DAMAGED', 'MISSING', 'OTHER'
);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "active_substances" TEXT[] NOT NULL DEFAULT '{}',
  "formulation" "ProductFormulation" NOT NULL,
  "permit_number" TEXT,
  "permit_holder" TEXT,
  "antidote" TEXT,
  "ventilation_period" TEXT,
  "exposure_period" TEXT,
  "recommendations" TEXT,
  "default_dosage" NUMERIC(10,3),
  "default_unit" "MeasurementUnit",
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_name_trim_chk" CHECK (length(trim("name")) >= 2),
  CONSTRAINT "products_default_dosage_chk" CHECK (
    "default_dosage" IS NULL OR "default_dosage" > 0
  ),
  CONSTRAINT "products_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Active product names are unique; archived names may be reused.
CREATE UNIQUE INDEX "products_name_active_uidx"
  ON "products" ("name")
  WHERE "archived" = false;

CREATE INDEX "products_archived_name_idx"
  ON "products" ("archived", "name");

-- ---------------------------------------------------------------------------
-- visit_products
-- ---------------------------------------------------------------------------

CREATE TABLE "visit_products" (
  "id" UUID NOT NULL,
  "visit_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" NUMERIC(10,3) NOT NULL,
  "unit" "MeasurementUnit" NOT NULL,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "visit_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visit_products_quantity_chk" CHECK ("quantity" > 0),
  CONSTRAINT "visit_products_visit_id_fkey"
    FOREIGN KEY ("visit_id") REFERENCES "visits"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visit_products_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visit_products_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "visit_products_visit_id_product_id_key"
  ON "visit_products" ("visit_id", "product_id");

CREATE INDEX "visit_products_visit_id_idx" ON "visit_products" ("visit_id");
CREATE INDEX "visit_products_product_id_idx" ON "visit_products" ("product_id");

-- ---------------------------------------------------------------------------
-- visits.visit_products_snapshot
-- Written when a linked invoice transitions to ISSUED (no never-invoiced
-- confirm path in this model — snapshots only on invoice issue).
-- ---------------------------------------------------------------------------

ALTER TABLE "visits"
  ADD COLUMN "visit_products_snapshot" JSONB;

-- ---------------------------------------------------------------------------
-- monitoring_points
-- ---------------------------------------------------------------------------

CREATE TABLE "monitoring_points" (
  "id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "location" TEXT,
  "type" "MonitoringPointType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "monitoring_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "monitoring_points_label_trim_chk" CHECK (length(trim("label")) >= 1),
  CONSTRAINT "monitoring_points_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "monitoring_points_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "monitoring_points_site_id_label_key"
  ON "monitoring_points" ("site_id", "label");

CREATE INDEX "monitoring_points_site_id_active_idx"
  ON "monitoring_points" ("site_id", "active");

-- ---------------------------------------------------------------------------
-- monitoring_point_checks
-- photo_file_id is nullable and unused in P9 (column reserved for a future
-- photo task — no upload UI). Checks are visit-scoped only (no standalone
-- inspection model).
-- ---------------------------------------------------------------------------

CREATE TABLE "monitoring_point_checks" (
  "id" UUID NOT NULL,
  "point_id" UUID NOT NULL,
  "visit_id" UUID NOT NULL,
  "checked_at" DATE NOT NULL,
  "status" "MonitoringPointStatus" NOT NULL,
  "notes" TEXT,
  "photo_file_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "monitoring_point_checks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "monitoring_point_checks_checked_at_chk" CHECK (
    "checked_at" <= (now() AT TIME ZONE 'Europe/Sofia')::date
  ),
  CONSTRAINT "monitoring_point_checks_point_id_fkey"
    FOREIGN KEY ("point_id") REFERENCES "monitoring_points"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "monitoring_point_checks_visit_id_fkey"
    FOREIGN KEY ("visit_id") REFERENCES "visits"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "monitoring_point_checks_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "monitoring_point_checks_point_id_visit_id_key"
  ON "monitoring_point_checks" ("point_id", "visit_id");

CREATE INDEX "monitoring_point_checks_visit_id_idx"
  ON "monitoring_point_checks" ("visit_id");

CREATE INDEX "monitoring_point_checks_point_id_checked_at_idx"
  ON "monitoring_point_checks" ("point_id", "checked_at" DESC);

-- ---------------------------------------------------------------------------
-- Freeze trigger (23P04): visit_products + monitoring_point_checks blocked
-- when the visit's linked invoice is ISSUED (or cancelled-by-credit-note).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION visit_children_reject_when_frozen()
RETURNS TRIGGER AS $$
DECLARE
  v_visit_id uuid;
  inv_status "InvoiceStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_visit_id := OLD.visit_id;
  ELSE
    v_visit_id := NEW.visit_id;
  END IF;

  SELECT i.status
    INTO inv_status
  FROM invoice_visit iv
  JOIN invoices i ON i.id = iv.invoice_id
  WHERE iv.visit_id = v_visit_id
  LIMIT 1;

  IF inv_status IS NOT NULL AND inv_status <> 'DRAFT' THEN
    RAISE EXCEPTION
      'visit children frozen: visit % linked invoice status %',
      v_visit_id, inv_status
      USING ERRCODE = '23P04';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_visit_products_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON visit_products
  FOR EACH ROW
  EXECUTE FUNCTION visit_children_reject_when_frozen();

CREATE TRIGGER trg_monitoring_point_checks_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON monitoring_point_checks
  FOR EACH ROW
  EXECUTE FUNCTION visit_children_reject_when_frozen();

-- ---------------------------------------------------------------------------
-- Point-in-site trigger (23P05 → POINT_NOT_IN_SITE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION monitoring_point_checks_point_in_site()
RETURNS TRIGGER AS $$
DECLARE
  point_site uuid;
  visit_site uuid;
BEGIN
  SELECT site_id INTO point_site FROM monitoring_points WHERE id = NEW.point_id;
  SELECT site_id INTO visit_site FROM visits WHERE id = NEW.visit_id;

  IF point_site IS NULL OR visit_site IS NULL OR point_site <> visit_site THEN
    RAISE EXCEPTION
      'POINT_NOT_IN_SITE: point % site % vs visit % site %',
      NEW.point_id, point_site, NEW.visit_id, visit_site
      USING ERRCODE = '23P05';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_monitoring_point_checks_point_in_site
  BEFORE INSERT OR UPDATE OF point_id, visit_id ON monitoring_point_checks
  FOR EACH ROW
  EXECUTE FUNCTION monitoring_point_checks_point_in_site();

-- ---------------------------------------------------------------------------
-- sites.monitoring_points_count sync via trigger (cannot drift)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION monitoring_points_sync_site_count()
RETURNS TRIGGER AS $$
DECLARE
  sid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    sid := OLD.site_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.site_id IS DISTINCT FROM NEW.site_id THEN
    -- Recount both sites if site_id ever changes (not exposed in API).
    UPDATE sites s
    SET monitoring_points_count = (
      SELECT count(*)::int FROM monitoring_points mp
      WHERE mp.site_id = s.id AND mp.active = true
    ),
    updated_at = now()
    WHERE s.id IN (OLD.site_id, NEW.site_id);
    RETURN NEW;
  ELSE
    sid := NEW.site_id;
  END IF;

  UPDATE sites
  SET monitoring_points_count = (
    SELECT count(*)::int FROM monitoring_points mp
    WHERE mp.site_id = sid AND mp.active = true
  ),
  updated_at = now()
  WHERE id = sid;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_monitoring_points_sync_site_count
  AFTER INSERT OR UPDATE OR DELETE ON monitoring_points
  FOR EACH ROW
  EXECUTE FUNCTION monitoring_points_sync_site_count();

-- ---------------------------------------------------------------------------
-- Snapshot on invoice issue (AFTER UPDATE on invoices → visits JSONB).
-- Runs inside the issue transaction; touches visits only, not invoices.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoices_snapshot_visit_products_on_issue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ISSUED'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.document_type = 'INVOICE'
  THEN
    UPDATE visits v
    SET
      visit_products_snapshot = COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'productId', p.id,
            'name', p.name,
            'activeSubstances', to_jsonb(p.active_substances),
            'formulation', p.formulation,
            'permitNumber', p.permit_number,
            'antidote', p.antidote,
            'ventilationPeriod', p.ventilation_period,
            'exposurePeriod', p.exposure_period,
            'recommendations', p.recommendations,
            'quantity', vp.quantity::text,
            'unit', vp.unit,
            'notes', vp.notes
          )
          ORDER BY p.name
        )
        FROM visit_products vp
        JOIN products p ON p.id = vp.product_id
        WHERE vp.visit_id = v.id
      ), '[]'::jsonb),
      updated_at = now()
    WHERE v.id IN (
      SELECT iv.visit_id FROM invoice_visit iv WHERE iv.invoice_id = NEW.id
    )
    AND v.visit_products_snapshot IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_snapshot_visit_products
  AFTER UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION invoices_snapshot_visit_products_on_issue();

-- ---------------------------------------------------------------------------
-- audit_attach
-- ---------------------------------------------------------------------------

SELECT audit_attach('products', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('visit_products', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('monitoring_points', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('monitoring_point_checks', ARRAY[]::text[], ARRAY[]::text[]);
