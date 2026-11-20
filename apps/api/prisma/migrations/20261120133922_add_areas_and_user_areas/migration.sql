-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- Case-insensitive unique name (Cyrillic-safe via Postgres lower()).
CREATE UNIQUE INDEX "areas_name_lower_uidx" ON "areas" (lower("name"));

-- CreateTable
CREATE TABLE "user_areas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_areas_area_id_idx" ON "user_areas"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_areas_user_id_area_id_key" ON "user_areas"("user_id", "area_id");

-- AddForeignKey
ALTER TABLE "user_areas" ADD CONSTRAINT "user_areas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_areas" ADD CONSTRAINT "user_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level audit (own UUID PKs so the trigger can record entity_id).
SELECT audit_attach('areas', ARRAY[]::text[], ARRAY[]::text[]);
SELECT audit_attach('user_areas', ARRAY[]::text[], ARRAY[]::text[]);
