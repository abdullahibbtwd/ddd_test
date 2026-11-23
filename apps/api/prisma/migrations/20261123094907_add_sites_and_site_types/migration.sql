-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'TERMINATED');

-- CreateTable
CREATE TABLE "site_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_types_pkey" PRIMARY KEY ("id")
);

-- Case-insensitive unique name (Cyrillic-aware via lower()).
CREATE UNIQUE INDEX "site_types_name_lower_uidx" ON "site_types" (lower("name"));

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "site_type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" NUMERIC(9,6),
    "longitude" NUMERIC(9,6),
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "floor_area_m2" NUMERIC(10,2),
    "monitoring_points_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- Foreign keys (RESTRICT — no physical deletes of referenced rows).
ALTER TABLE "sites" ADD CONSTRAINT "sites_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sites" ADD CONSTRAINT "sites_area_id_fkey"
  FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sites" ADD CONSTRAINT "sites_site_type_id_fkey"
  FOREIGN KEY ("site_type_id") REFERENCES "site_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECKs
ALTER TABLE "sites" ADD CONSTRAINT "sites_coords_pair_chk" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)
);
ALTER TABLE "sites" ADD CONSTRAINT "sites_latitude_range_chk" CHECK (
  "latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)
);
ALTER TABLE "sites" ADD CONSTRAINT "sites_longitude_range_chk" CHECK (
  "longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180)
);
ALTER TABLE "sites" ADD CONSTRAINT "sites_monitoring_points_chk" CHECK (
  "monitoring_points_count" >= 0
);
ALTER TABLE "sites" ADD CONSTRAINT "sites_floor_area_chk" CHECK (
  "floor_area_m2" IS NULL OR "floor_area_m2" > 0
);
ALTER TABLE "sites" ADD CONSTRAINT "sites_status_terminated_at_chk" CHECK (
  ("status" = 'TERMINATED') = ("terminated_at" IS NOT NULL)
);

-- Indexes
CREATE INDEX "sites_area_id_status_idx" ON "sites" ("area_id", "status");
CREATE INDEX "sites_client_id_idx" ON "sites" ("client_id");
CREATE INDEX "sites_site_type_id_idx" ON "sites" ("site_type_id");
CREATE INDEX "sites_name_trgm_idx" ON "sites" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "sites_address_trgm_idx" ON "sites" USING GIN ("address" gin_trgm_ops);

-- Seed default site types (Postgres 18 native uuidv7()).
INSERT INTO "site_types" ("id", "name", "is_active", "created_at", "updated_at")
SELECT uuidv7(), v.name, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('Ресторант'),
  ('Магазин'),
  ('Склад'),
  ('Хотел'),
  ('Училище'),
  ('Детска градина'),
  ('Производство'),
  ('Офис'),
  ('Друго')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM "site_types" st WHERE lower(st.name) = lower(v.name)
);

-- Row-level audit.
SELECT audit_attach('site_types', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('sites', ARRAY[]::text[], ARRAY[]::text[]);
