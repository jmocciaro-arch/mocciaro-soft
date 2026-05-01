-- ================================================================
-- MIGRATION V45 — AI cache + usage tracking
-- Reduce costos cacheando respuestas de IA + trackea consumo real
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) Cache de respuestas de IA (por hash SHA256 del input)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_ai_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key       text UNIQUE NOT NULL,  -- sha256 del input (PDF base64 u otro)
  operation       text NOT NULL,          -- 'oc_parse' | 'chat' | etc
  input_preview   text,                   -- primeros 200 chars para debug
  output          jsonb NOT NULL,
  model_used      text,
  input_tokens    int,
  output_tokens   int,
  cost_usd        numeric(10,4) NOT NULL DEFAULT 0,
  hit_count       int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_hit_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_op        ON tt_ai_cache(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cache_last_hit  ON tt_ai_cache(last_hit_at DESC) WHERE last_hit_at IS NOT NULL;

-- ----------------------------------------------------------------
-- 2) Log de consumo — para ver cuánto gastamos en IA por día/operación
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_ai_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation       text NOT NULL,
  provider        text NOT NULL,          -- 'claude' | 'gemini'
  model           text,
  input_tokens    int NOT NULL DEFAULT 0,
  output_tokens   int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0,  -- tokens leídos del prompt cache (más barato)
  cache_hit       boolean NOT NULL DEFAULT false,
  cost_usd        numeric(10,4) NOT NULL DEFAULT 0,
  duration_ms     int,
  user_id         uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  company_id      uuid REFERENCES tt_companies(id) ON DELETE SET NULL,
  reference_type  text,                   -- 'oc_parse', 'chat', etc
  reference_id    uuid,                   -- id del objeto relacionado
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON tt_ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_op      ON tt_ai_usage(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user    ON tt_ai_usage(user_id, created_at DESC);

-- Vista agregada: consumo por día/operación
CREATE OR REPLACE VIEW tt_ai_usage_daily AS
SELECT
  DATE_TRUNC('day', created_at)::date AS day,
  operation,
  provider,
  model,
  COUNT(*)::int                       AS request_count,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::int AS cache_hits,
  SUM(input_tokens)::bigint           AS total_input_tokens,
  SUM(output_tokens)::bigint          AS total_output_tokens,
  SUM(cache_read_tokens)::bigint      AS total_cache_tokens,
  SUM(cost_usd)::numeric(10,4)        AS total_cost_usd,
  AVG(duration_ms)::int               AS avg_duration_ms
FROM tt_ai_usage
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC;

-- ================================================================
-- RLS
-- ================================================================
ALTER TABLE tt_ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_ai_usage ENABLE ROW LEVEL SECURITY;

DO $do$ BEGIN
  CREATE POLICY "ai_cache_read" ON tt_ai_cache FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "ai_cache_all"  ON tt_ai_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY "ai_usage_read" ON tt_ai_usage FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "ai_usage_all"  ON tt_ai_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

NOTIFY pgrst, 'reload schema';
COMMIT;
