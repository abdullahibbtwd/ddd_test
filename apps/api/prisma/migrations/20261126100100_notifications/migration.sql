-- Task 20 (Phase 11): in-app notifications + client notify_by_email.
-- Rows are created by the daily sweep. Content is immutable.
-- read_at and dismissed_at are the only columns an UPDATE may change.
-- DELETE is rejected (dismiss sets dismissed_at). SQLSTATE 23P06.
-- body_params must not contain legal names of people or EGN (enforced in the app).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "NotificationKind" AS ENUM (
  'CERTIFICATE_EXPIRING',
  'AGREEMENT_EXPIRING',
  'FOOD_SCHEDULE_DUE',
  'INVOICE_OVERDUE'
);

CREATE TYPE "NotificationPriority" AS ENUM (
  'NORMAL',
  'HIGH'
);

CREATE TYPE "NotificationRecipientType" AS ENUM (
  'SYSTEM_USER',
  'CLIENT_CONTACT'
);

-- ---------------------------------------------------------------------------
-- clients.notify_by_email (default false — no backfill)
-- ---------------------------------------------------------------------------

ALTER TABLE "clients"
  ADD COLUMN "notify_by_email" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- notifications
-- No updated_at: the row is immutable except read/dismiss timestamps.
-- ---------------------------------------------------------------------------

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "recipient_user_id" UUID,
  "recipient_client_id" UUID,
  "recipient_type" "NotificationRecipientType" NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" UUID NOT NULL,
  "threshold_day" INTEGER NOT NULL,
  "priority" "NotificationPriority" NOT NULL,
  "title_i18n_key" TEXT NOT NULL,
  "body_i18n_key" TEXT NOT NULL,
  "body_params" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "read_at" TIMESTAMPTZ,
  "dismissed_at" TIMESTAMPTZ,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_threshold_day_chk" CHECK ("threshold_day" >= 0),
  CONSTRAINT "notifications_recipient_chk" CHECK (
    (
      "recipient_type" = 'SYSTEM_USER'
      AND "recipient_user_id" IS NOT NULL
      AND "recipient_client_id" IS NULL
    )
    OR (
      "recipient_type" = 'CLIENT_CONTACT'
      AND "recipient_client_id" IS NOT NULL
      AND "recipient_user_id" IS NULL
    )
  ),
  CONSTRAINT "notifications_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notifications_recipient_client_id_fkey"
    FOREIGN KEY ("recipient_client_id") REFERENCES "clients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Dedup: one row per recipient + kind + entity + threshold.
-- Partial because the two recipient channels use different columns.
CREATE UNIQUE INDEX "notifications_user_dedup_uidx"
  ON "notifications" ("recipient_user_id", "kind", "entity_type", "entity_id", "threshold_day")
  WHERE "recipient_user_id" IS NOT NULL;

CREATE UNIQUE INDEX "notifications_client_dedup_uidx"
  ON "notifications" ("recipient_client_id", "kind", "entity_type", "entity_id", "threshold_day")
  WHERE "recipient_client_id" IS NOT NULL;

CREATE INDEX "notifications_user_bell_idx"
  ON "notifications" ("recipient_user_id", "read_at", "dismissed_at", "created_at" DESC);

CREATE INDEX "notifications_client_read_idx"
  ON "notifications" ("recipient_client_id", "read_at", "created_at" DESC);

CREATE INDEX "notifications_kind_entity_idx"
  ON "notifications" ("kind", "entity_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- Immutability: only read_at and dismissed_at may change. DELETE rejected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notifications_reject_content_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
    OR NEW.recipient_client_id IS DISTINCT FROM OLD.recipient_client_id
    OR NEW.recipient_type IS DISTINCT FROM OLD.recipient_type
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
    OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
    OR NEW.threshold_day IS DISTINCT FROM OLD.threshold_day
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.title_i18n_key IS DISTINCT FROM OLD.title_i18n_key
    OR NEW.body_i18n_key IS DISTINCT FROM OLD.body_i18n_key
    OR NEW.body_params IS DISTINCT FROM OLD.body_params
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'notifications content is immutable (only read_at and dismissed_at may change)'
      USING ERRCODE = '23P06';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_reject_content_update
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notifications_reject_content_update();

CREATE OR REPLACE FUNCTION notifications_reject_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE rejected on notifications (dismiss sets dismissed_at)'
    USING ERRCODE = '23P06';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_no_delete
  BEFORE DELETE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notifications_reject_delete();

SELECT audit_attach('notifications', ARRAY[]::text[], ARRAY[]::text[]);

-- ---------------------------------------------------------------------------
-- email_events: kind NOTIFICATION + nullable notification_id
-- invoice_id becomes nullable because a notification email is not an invoice.
-- CHECK keeps the two shapes exclusive.
-- ---------------------------------------------------------------------------

ALTER TABLE "email_events" ALTER COLUMN "invoice_id" DROP NOT NULL;

ALTER TABLE "email_events" ADD COLUMN "notification_id" UUID;

ALTER TABLE "email_events"
  ADD CONSTRAINT "email_events_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "notifications"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_events"
  ADD CONSTRAINT "email_events_kind_target_chk" CHECK (
    (
      "kind" IN ('INVOICE', 'REMINDER')
      AND "invoice_id" IS NOT NULL
      AND "notification_id" IS NULL
    )
    OR (
      "kind" = 'NOTIFICATION'
      AND "notification_id" IS NOT NULL
      AND "invoice_id" IS NULL
    )
  );

CREATE INDEX "email_events_notification_id_created_at_idx"
  ON "email_events" ("notification_id", "created_at" DESC);
