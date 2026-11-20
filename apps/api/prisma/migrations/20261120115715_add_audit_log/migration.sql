-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('api', 'worker', 'cli', 'system');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "AuditSource" NOT NULL,
    "actor_user_id" UUID,
    "actor_label" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "changed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "meta" JSONB,
    "request_id" TEXT,
    "ip" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_occurred_at_idx" ON "audit_log"("entity_type", "entity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_occurred_at_idx" ON "audit_log"("actor_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log"("occurred_at" DESC);

-- ---------------------------------------------------------------------------
-- Append-only enforcement (UPDATE / DELETE / TRUNCATE raise)
-- Note: the table owner can still DROP these triggers — restricted DB role
-- is a go-live hardening item (see docs/AUDIT.md).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_reject_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER trg_audit_log_reject_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER trg_audit_log_reject_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_log_reject_mutation();

-- ---------------------------------------------------------------------------
-- Generic row-change capture
-- Trigger args (via TG_ARGV):
--   TG_ARGV[0] = comma-separated masked columns (values omitted from snapshots;
--                names still appear in changed_fields)
--   TG_ARGV[1] = comma-separated ignored columns (an UPDATE whose only changes
--                are in these columns — plus always-ignored updated_at —
--                writes no audit row)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS TRIGGER AS $$
DECLARE
  masked text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  ignored text[] := string_to_array(coalesce(TG_ARGV[1], ''), ',');
  always_ignored text[] := ARRAY['updated_at'];
  ignore_set text[];
  before_j jsonb;
  after_j jsonb;
  changed text[] := ARRAY[]::text[];
  col text;
  entity_id text;
  actor_id text;
  actor_label text;
  src text;
  req_id text;
  client_ip text;
  src_enum "AuditSource";
BEGIN
  -- Normalize empty string from blank TG_ARGV into empty arrays
  IF masked = ARRAY['']::text[] THEN
    masked := ARRAY[]::text[];
  END IF;
  IF ignored = ARRAY['']::text[] THEN
    ignored := ARRAY[]::text[];
  END IF;

  ignore_set := ignored || always_ignored;

  IF TG_OP = 'DELETE' THEN
    before_j := to_jsonb(OLD);
    after_j := NULL;
    entity_id := OLD.id::text;
  ELSIF TG_OP = 'INSERT' THEN
    before_j := NULL;
    after_j := to_jsonb(NEW);
    entity_id := NEW.id::text;
  ELSE
    before_j := to_jsonb(OLD);
    after_j := to_jsonb(NEW);
    entity_id := NEW.id::text;

    FOR col IN
      SELECT k FROM (
        SELECT jsonb_object_keys(before_j) AS k
        UNION
        SELECT jsonb_object_keys(after_j) AS k
      ) keys
    LOOP
      IF (before_j -> col) IS DISTINCT FROM (after_j -> col) THEN
        changed := array_append(changed, col);
      END IF;
    END LOOP;

    -- Drop the row entirely when every changed column is ignored
    IF changed <@ ignore_set THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Strip masked column VALUES from snapshots (names stay in changed_fields)
  IF before_j IS NOT NULL THEN
    before_j := before_j - masked;
  END IF;
  IF after_j IS NOT NULL THEN
    after_j := after_j - masked;
  END IF;

  actor_id := nullif(current_setting('app.actor_id', true), '');
  actor_label := nullif(current_setting('app.actor_label', true), '');
  src := nullif(current_setting('app.source', true), '');
  req_id := nullif(current_setting('app.request_id', true), '');
  client_ip := nullif(current_setting('app.ip', true), '');

  IF src IS NULL OR src = '' THEN
    src_enum := 'system';
  ELSE
    src_enum := src::"AuditSource";
  END IF;

  INSERT INTO audit_log (
    id,
    occurred_at,
    source,
    actor_user_id,
    actor_label,
    action,
    entity_type,
    entity_id,
    before,
    after,
    changed_fields,
    meta,
    request_id,
    ip
  ) VALUES (
    uuidv7(),
    clock_timestamp(),
    src_enum,
    CASE WHEN actor_id IS NULL THEN NULL ELSE actor_id::uuid END,
    actor_label,
    CASE TG_OP
      WHEN 'INSERT' THEN 'CREATE'
      WHEN 'UPDATE' THEN 'UPDATE'
      WHEN 'DELETE' THEN 'DELETE'
    END,
    TG_TABLE_NAME,
    entity_id,
    before_j,
    after_j,
    CASE WHEN TG_OP = 'UPDATE' THEN changed ELSE ARRAY[]::TEXT[] END,
    NULL,
    req_id,
    client_ip
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Register a table for row-level audit in one call from future migrations.
CREATE OR REPLACE FUNCTION audit_attach(
  target_table regclass,
  masked text[] DEFAULT ARRAY[]::text[],
  ignored text[] DEFAULT ARRAY[]::text[]
) RETURNS void AS $$
DECLARE
  tbl text := target_table::text;
  -- Strip schema qualification for trigger name / TG_TABLE_NAME consistency
  bare text := CASE WHEN position('.' IN tbl) > 0
    THEN split_part(tbl, '.', 2)
    ELSE tbl
  END;
  bare_clean text := trim(both '"' from bare);
  masked_csv text := array_to_string(masked, ',');
  ignored_csv text := array_to_string(ignored, ',');
  trg text := 'trg_audit_' || bare_clean;
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trg, target_table);
  EXECUTE format(
    'CREATE TRIGGER %I
       AFTER INSERT OR UPDATE OR DELETE ON %s
       FOR EACH ROW
       EXECUTE FUNCTION audit_row_change(%L, %L)',
    trg,
    target_table,
    masked_csv,
    ignored_csv
  );
END;
$$ LANGUAGE plpgsql;

-- users: mask password_hash; ignore login/lockout counters (+ always updated_at)
SELECT audit_attach(
  'users',
  ARRAY['password_hash']::text[],
  ARRAY['last_login_at', 'failed_login_count', 'locked_until']::text[]
);

-- auth_sessions and audit_log are NOT row-audited (noise / recursion).
-- Session security events are logged explicitly via AuditService.
