-- ════════════════════════════════════════════════════════════════════════
-- Migration v59 — Tabla tt_cron_runs para observabilidad de cron jobs
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY: Fase 0.6 del PLAN-REFACTOR. Hoy hay 8 cron jobs en vercel.json
-- (alerts, daily-digest, FX rates, sequences, AI summary, check-emails,
-- scheduled-exports, catalog-rules) sin ninguna observabilidad.
-- Si uno falla 3 días seguidos, no nos enteramos hasta que un cliente
-- reclame.
--
-- Esta migración crea la tabla `tt_cron_runs` que actúa como bitácora
-- append-only de cada corrida de cron. El wrapper TS `withCronLogging()`
-- (commit siguiente) inserta filas automáticamente con start/end/status
-- y permite query desde /admin/observability para ver últimas N corridas.
--
-- HOW TO APPLY:
--   1. Aplicar primero en STAGING.
--   2. El wrapper TS funciona aunque la tabla no exista (degraded mode),
--      así que aplicar la migración en cualquier momento sin coordinación.
--
-- ROLLBACK: ver al final.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Tabla tt_cron_runs
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tt_cron_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name    TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed', 'timeout')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER,
  -- Detalles de éxito (opcional, schema libre por cron)
  result       JSONB,
  -- Error info (si status='failed' o 'timeout')
  error_message TEXT,
  error_stack   TEXT,
  -- Trigger info (Vercel cron envía un cron_id propio)
  triggered_by TEXT NOT NULL DEFAULT 'vercel-cron'
    CHECK (triggered_by IN ('vercel-cron', 'manual', 'test', 'external')),
  -- Versión del código que corrió (para correlacionar con un commit)
  app_version  TEXT,
  -- Quién pidió la corrida si fue manual
  triggered_by_user UUID REFERENCES tt_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tt_cron_runs_name_started
  ON tt_cron_runs(cron_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_tt_cron_runs_status
  ON tt_cron_runs(status, started_at DESC)
  WHERE status IN ('failed', 'timeout');

CREATE INDEX IF NOT EXISTS idx_tt_cron_runs_recent
  ON tt_cron_runs(started_at DESC);

COMMENT ON TABLE tt_cron_runs IS
  'Bitácora append-only de corridas de cron jobs. Una fila por corrida (start o success/failed). Lectura desde /admin/observability.';

COMMENT ON COLUMN tt_cron_runs.status IS
  'started=arrancó pero aún no terminó · success=ok · failed=error · timeout=excedió tiempo límite Vercel.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Helpers RPC para insertar runs (used por wrapper TS)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_log_cron_start(
  p_cron_name text,
  p_endpoint text,
  p_triggered_by text DEFAULT 'vercel-cron',
  p_app_version text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO tt_cron_runs (cron_name, endpoint, status, triggered_by, app_version)
  VALUES (p_cron_name, p_endpoint, 'started', p_triggered_by, p_app_version)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_log_cron_finish(
  p_run_id uuid,
  p_status text,
  p_result jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_error_stack text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz;
BEGIN
  IF p_status NOT IN ('success', 'failed', 'timeout') THEN
    RAISE EXCEPTION 'fn_log_cron_finish: status inválido %', p_status;
  END IF;

  SELECT started_at INTO v_started_at FROM tt_cron_runs WHERE id = p_run_id;

  UPDATE tt_cron_runs
     SET finished_at = now(),
         duration_ms = (extract(epoch from now() - v_started_at) * 1000)::int,
         status = p_status,
         result = p_result,
         error_message = p_error_message,
         error_stack = p_error_stack
   WHERE id = p_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_log_cron_start(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_log_cron_finish(uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
-- service_role mantiene execute (usado por endpoints /api/cron/*).

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS — SELECT solo para admin/super_admin
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE tt_cron_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cron_runs_admin_read" ON tt_cron_runs;
CREATE POLICY "cron_runs_admin_read"
  ON tt_cron_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'super_admin', 'superadmin')
        AND u.active IS NOT FALSE
    )
  );

-- INSERT/UPDATE/DELETE: solo service_role (vía RPCs).
-- authenticated NO puede escribir directo.
-- (Postgres bloquea por default si no hay policy de INSERT/UPDATE/DELETE
--  para authenticated cuando RLS está enabled.)

-- ─────────────────────────────────────────────────────────────────────
-- 4. Vista de resumen para dashboard
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_cron_health AS
SELECT
  cron_name,
  count(*) FILTER (WHERE started_at > now() - interval '24 hours') AS runs_24h,
  count(*) FILTER (WHERE started_at > now() - interval '24 hours' AND status = 'success') AS success_24h,
  count(*) FILTER (WHERE started_at > now() - interval '24 hours' AND status = 'failed') AS failed_24h,
  count(*) FILTER (WHERE started_at > now() - interval '24 hours' AND status = 'timeout') AS timeout_24h,
  max(started_at) FILTER (WHERE status = 'success') AS last_success_at,
  max(started_at) FILTER (WHERE status IN ('failed', 'timeout')) AS last_failure_at,
  avg(duration_ms) FILTER (WHERE status = 'success' AND started_at > now() - interval '7 days') AS avg_duration_ms_7d,
  -- "consecutive_failures" = corridas seguidas con status != success
  -- desde la última success.
  count(*) FILTER (
    WHERE status IN ('failed', 'timeout')
      AND started_at > coalesce(
        (SELECT max(started_at) FROM tt_cron_runs r2
          WHERE r2.cron_name = tt_cron_runs.cron_name AND r2.status = 'success'),
        '1900-01-01'::timestamptz
      )
  ) AS consecutive_failures
FROM tt_cron_runs
GROUP BY cron_name;

GRANT SELECT ON vw_cron_health TO authenticated;

COMMENT ON VIEW vw_cron_health IS
  'Resumen por cron: runs últimas 24h, last_success, last_failure, avg duration 7d, consecutive_failures (alerta si >2).';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (no ejecutar salvo emergencia)
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP VIEW IF EXISTS vw_cron_health;
-- DROP POLICY IF EXISTS "cron_runs_admin_read" ON tt_cron_runs;
-- DROP FUNCTION IF EXISTS fn_log_cron_finish(uuid, text, jsonb, text, text);
-- DROP FUNCTION IF EXISTS fn_log_cron_start(text, text, text, text);
-- DROP TABLE IF EXISTS tt_cron_runs;
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════
