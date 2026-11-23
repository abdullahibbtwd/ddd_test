-- Exclusion constraints need btree_gist (equality on UUID + range overlap).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enums
CREATE TYPE "SubscriptionFrequency" AS ENUM ('MONTHLY', 'EVERY_2_MONTHS', 'QUARTERLY', 'ON_DEMAND');
CREATE TYPE "ServiceType" AS ENUM ('INSECT_CONTROL', 'RODENT_CONTROL', 'DISINFECTION', 'OTHER');

-- Helper for CHECK: no subqueries allowed directly in CHECK constraints.
CREATE OR REPLACE FUNCTION array_elements_are_unique(arr anyarray)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT COALESCE(cardinality(arr), 0) = COALESCE(
    (SELECT count(DISTINCT x)::int FROM unnest(arr) AS x),
    0
  );
$$;

-- Table
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "services" "ServiceType"[] NOT NULL,
    "frequency" "SubscriptionFrequency" NOT NULL,
    "rate" NUMERIC(12,2) NOT NULL,
    "rate_includes_vat" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_site_id_fkey"
  FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECKs
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_services_nonempty_chk"
  CHECK (cardinality("services") >= 1);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_services_unique_chk"
  CHECK (array_elements_are_unique("services"));

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_rate_nonnegative_chk"
  CHECK ("rate" >= 0);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_end_after_start_chk"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- One active subscription per site per day: inclusive daterange; null end = open-ended.
-- Adjacent ranges (…–2026-03-31 and 2026-04-01–…) do not overlap.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_site_daterange_excl"
  EXCLUDE USING gist (
    site_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );

CREATE INDEX "subscriptions_site_id_idx" ON "subscriptions" ("site_id");
CREATE INDEX "subscriptions_end_date_idx" ON "subscriptions" ("end_date");

SELECT audit_attach('subscriptions', ARRAY[]::text[], ARRAY[]::text[]);
