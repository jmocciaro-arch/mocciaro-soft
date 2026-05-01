-- ================================================================
-- MIGRATION V44 — Soft-delete + Solicitudes de borrado para OCs
-- Admin puede borrar directo; vendedor/usuario solicita y admin aprueba.
-- ================================================================

BEGIN;

-- Campos de auditoría de borrado en tt_oc_parsed
ALTER TABLE tt_oc_parsed
  ADD COLUMN IF NOT EXISTS deletion_status         text NOT NULL DEFAULT 'active'
    CHECK (deletion_status IN ('active','deletion_requested','deleted')),
  ADD COLUMN IF NOT EXISTS deletion_requested_by   uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_requested_at   timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reason         text,
  ADD COLUMN IF NOT EXISTS deletion_reviewed_by    uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reviewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_review_notes   text;

CREATE INDEX IF NOT EXISTS idx_oc_parsed_deletion_status
  ON tt_oc_parsed(deletion_status)
  WHERE deletion_status <> 'active';

-- Log de audit (append-only) para todas las acciones sobre OC
CREATE TABLE IF NOT EXISTS tt_oc_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_parsed_id   uuid REFERENCES tt_oc_parsed(id) ON DELETE SET NULL,
  action         text NOT NULL,  -- 'deletion_requested','deletion_approved','deletion_rejected','deleted'
  performed_by   uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  reason         text,
  notes          text,
  snapshot       jsonb,          -- snapshot de la OC al momento de la acción
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oc_audit_log_oc  ON tt_oc_audit_log(oc_parsed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oc_audit_log_action ON tt_oc_audit_log(action);

-- RLS
ALTER TABLE tt_oc_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "oc_audit_read"  ON tt_oc_audit_log FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "oc_audit_write" ON tt_oc_audit_log FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "oc_audit_all"   ON tt_oc_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
