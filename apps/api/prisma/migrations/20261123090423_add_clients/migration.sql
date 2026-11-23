-- CreateEnum
CREATE TYPE "ClientKind" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "kind" "ClientKind" NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "eik" TEXT,
    "vat_number" TEXT,
    "registered_address" TEXT,
    "legal_representative" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "preferred_payment_method" "PaymentMethod",
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- COMPANY requires EIK; when present EIK is 9 or 13 digits only.
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_eik_chk" CHECK (
  ("kind" <> 'COMPANY' OR "eik" IS NOT NULL)
  AND ("eik" IS NULL OR "eik" ~ '^\d{9}$' OR "eik" ~ '^\d{13}$')
);

-- One client per EIK (including archived).
CREATE UNIQUE INDEX "clients_eik_uidx" ON "clients" ("eik") WHERE "eik" IS NOT NULL;

-- List default: active by name.
CREATE INDEX "clients_is_active_name_idx" ON "clients" ("is_active", "name");

-- Trigram indexes for contains / similarity search (pg_trgm already installed).
CREATE INDEX "clients_name_trgm_idx" ON "clients" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "clients_name_normalized_trgm_idx" ON "clients" USING GIN ("name_normalized" gin_trgm_ops);

-- Row-level audit.
SELECT audit_attach('clients', ARRAY[]::text[], ARRAY[]::text[]);
