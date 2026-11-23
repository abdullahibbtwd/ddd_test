-- length(trim(NULL)) is NULL; CHECK allows UNKNOWN. Require cancel_reason explicitly.
ALTER TABLE "visits" DROP CONSTRAINT "visits_cancel_consistency_chk";

ALTER TABLE "visits" ADD CONSTRAINT "visits_cancel_consistency_chk"
  CHECK (
    ("status" = 'ACTIVE' AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL
      AND "cancel_reason" IS NOT NULL AND length(trim("cancel_reason")) >= 3)
  );
