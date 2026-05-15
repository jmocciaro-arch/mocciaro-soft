-- ════════════════════════════════════════════════════════════════════════
-- migration-v74: Versionado de cotizaciones (FASE 1.4)
-- ════════════════════════════════════════════════════════════════════════
-- OBJETIVO:
--   Permitir editar una COT post-envío sin perder historial. Cada edición
--   crea un snapshot en tt_quote_versions. La versión "aceptada por el
--   cliente" queda marcada con accepted_at + accepted_version_number en
--   tt_quotes.
--
-- ESQUEMA:
--   tt_quotes:
--     + current_version_number INT NOT NULL DEFAULT 1
--     + accepted_version_number INT NULL  -- versión que el cliente aceptó
--
--   tt_quote_versions:
--     id, quote_id, version_number, snapshot (jsonb completo de la COT
--     en ese momento), items_snapshot (jsonb array), created_by,
--     created_at, change_summary (TEXT corto), parent_version_id
--
-- IDEMPOTENTE.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Columnas en tt_quotes
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_quotes' AND column_name='current_version_number'
  ) THEN
    ALTER TABLE public.tt_quotes
      ADD COLUMN current_version_number INT NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_quotes' AND column_name='accepted_version_number'
  ) THEN
    ALTER TABLE public.tt_quotes
      ADD COLUMN accepted_version_number INT;
  END IF;
END $$;

COMMENT ON COLUMN public.tt_quotes.current_version_number IS
  'Versión actual editable. Incrementa con cada snapshot en tt_quote_versions.';
COMMENT ON COLUMN public.tt_quotes.accepted_version_number IS
  'Número de versión que el cliente aceptó (NULL si nunca aceptó). Sirve para mostrar "v3 (aceptada)" en la UI.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Tabla tt_quote_versions
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tt_quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.tt_quotes(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number >= 1),
  -- Snapshot completo de la fila tt_quotes (sin items)
  snapshot JSONB NOT NULL,
  -- Snapshot de items: [{sku, description, quantity, unit_price, discount_pct, subtotal, sort_order}]
  items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Resumen corto del cambio (lo que el editor pone: "Ajuste precio Tornillo")
  change_summary TEXT,
  parent_version_id UUID REFERENCES public.tt_quote_versions(id),
  created_by UUID REFERENCES public.tt_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (quote_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_tt_quote_versions_quote
  ON public.tt_quote_versions (quote_id, version_number DESC);

ALTER TABLE public.tt_quote_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_versions_authenticated_all ON public.tt_quote_versions;
CREATE POLICY quote_versions_authenticated_all
  ON public.tt_quote_versions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tt_quote_versions IS
  'Historial inmutable de versiones de COT. Cada edición post-envío genera una nueva fila. La COT activa apunta a la última versión vía tt_quotes.current_version_number.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC: snapshot_quote_version(quote_id, summary)
--    Toma la COT actual + sus items y persiste como nueva versión.
--    Incrementa current_version_number atómicamente.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION snapshot_quote_version(
  p_quote_id UUID,
  p_change_summary TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS TABLE (version_id UUID, version_number INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote JSONB;
  v_items JSONB;
  v_next_version INT;
  v_parent_id UUID;
  v_new_id UUID;
BEGIN
  -- Lock + capture snapshot
  SELECT to_jsonb(q.*) INTO v_quote
    FROM tt_quotes q WHERE q.id = p_quote_id FOR UPDATE;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Cotización % no encontrada', p_quote_id;
  END IF;

  -- Items snapshot
  SELECT COALESCE(jsonb_agg(to_jsonb(qi.*) ORDER BY qi.sort_order), '[]'::jsonb)
    INTO v_items
    FROM tt_quote_items qi WHERE qi.quote_id = p_quote_id;

  -- Próximo número
  v_next_version := (v_quote->>'current_version_number')::INT;
  IF v_next_version IS NULL THEN v_next_version := 1; END IF;

  -- Parent: última versión existente
  SELECT id INTO v_parent_id
    FROM tt_quote_versions
    WHERE quote_id = p_quote_id
    ORDER BY version_number DESC
    LIMIT 1;

  v_new_id := gen_random_uuid();

  INSERT INTO tt_quote_versions
    (id, quote_id, version_number, snapshot, items_snapshot,
     change_summary, parent_version_id, created_by)
  VALUES
    (v_new_id, p_quote_id, v_next_version, v_quote, v_items,
     p_change_summary, v_parent_id, p_actor_id);

  -- Incrementar para la próxima edición
  UPDATE tt_quotes
    SET current_version_number = v_next_version + 1,
        updated_at = now()
    WHERE id = p_quote_id;

  RETURN QUERY SELECT v_new_id, v_next_version;
END;
$$;

COMMENT ON FUNCTION snapshot_quote_version IS
  'Persiste la COT actual + sus items como una versión inmutable y avanza current_version_number. Llamar antes de aplicar la edición.';

-- ─────────────────────────────────────────────────────────────────────
-- 4. RPC: mark_quote_accepted_version(quote_id, version_number, actor)
--    Marca qué versión aceptó el cliente. Sólo se puede marcar una a
--    la vez (cliente puede cambiar de idea, queda último accepted).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_quote_accepted_version(
  p_quote_id UUID,
  p_version_number INT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM tt_quote_versions
    WHERE quote_id = p_quote_id AND version_number = p_version_number
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Version % no existe para quote %', p_version_number, p_quote_id;
  END IF;

  UPDATE tt_quotes
    SET accepted_version_number = p_version_number,
        accepted_at = now(),
        status = 'aceptada',
        updated_at = now()
    WHERE id = p_quote_id;

  INSERT INTO tt_activity_log (entity_type, entity_id, action, detail, created_by)
  VALUES ('quote', p_quote_id, 'version_accepted',
          format('Cliente aceptó versión %s', p_version_number), p_actor_id);
END;
$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
--   BEGIN;
--   DROP FUNCTION IF EXISTS snapshot_quote_version(uuid, text, uuid);
--   DROP FUNCTION IF EXISTS mark_quote_accepted_version(uuid, int, uuid);
--   DROP TABLE IF EXISTS tt_quote_versions CASCADE;
--   ALTER TABLE tt_quotes DROP COLUMN IF EXISTS current_version_number;
--   ALTER TABLE tt_quotes DROP COLUMN IF EXISTS accepted_version_number;
--   COMMIT;
-- ════════════════════════════════════════════════════════════════════════
