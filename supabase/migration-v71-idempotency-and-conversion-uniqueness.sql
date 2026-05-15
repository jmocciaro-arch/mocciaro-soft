-- ════════════════════════════════════════════════════════════════════════
-- migration-v71: Idempotencia genérica + unicidad de conversión COT→PED
-- ════════════════════════════════════════════════════════════════════════
-- FASE 0 — BLOQUEANTES (ETA 2026-05-16)
--
-- OBJETIVO:
--   1. Tabla tt_idempotency_keys: backing store del helper withIdempotency().
--      Permite que doble-click, retry de red o concurrent submit no creen
--      dos PED para la misma COT (entre otros).
--   2. Índice UNIQUE parcial en tt_document_relations(parent_id, relation_type)
--      para los tipos de relación que deben ser 1:1 (conversión COT→PED y
--      factura directa PED→FAC). NO afecta delivered_as (FASE 1.5 permite
--      múltiples REM por PED) ni invoiced_as desde delivery_note.
--
-- HOW TO APPLY:
--   Pegar este archivo en Supabase SQL Editor → Run. Idempotente.
--
-- ROLLBACK:
--   Ver bloque comentado al final.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Tabla tt_idempotency_keys
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tt_idempotency_keys (
  key TEXT PRIMARY KEY,
  -- Resultado serializado del primer request exitoso. Los retries lo devuelven.
  result JSONB NOT NULL,
  -- Scope opcional para introspección: 'quote_to_order', 'register_payment', etc.
  scope TEXT,
  -- Quién disparó la operación (auth.uid o sistema). Diagnóstico.
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Las keys viejas se pueden purgar. Default 30 días.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_tt_idempotency_keys_expires
  ON public.tt_idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS idx_tt_idempotency_keys_scope
  ON public.tt_idempotency_keys (scope, created_at DESC);

COMMENT ON TABLE public.tt_idempotency_keys IS
  'Backing store del helper withIdempotency(). Clave compuesta por el caller (ej: quote_to_order:{quoteId}:{userId}). Result se devuelve en retries para evitar duplicados.';

-- RLS: solo el dueño puede leer sus propias keys. Inserción libre.
ALTER TABLE public.tt_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_select_own ON public.tt_idempotency_keys;
CREATE POLICY idempotency_keys_select_own
  ON public.tt_idempotency_keys FOR SELECT
  USING (created_by = auth.uid() OR created_by IS NULL);

DROP POLICY IF EXISTS idempotency_keys_insert ON public.tt_idempotency_keys;
CREATE POLICY idempotency_keys_insert
  ON public.tt_idempotency_keys FOR INSERT
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Unicidad de conversión COT→PED en tt_document_relations
-- ─────────────────────────────────────────────────────────────────────
-- La tabla tt_document_relations ya tiene UNIQUE(parent_id, child_id, relation_type)
-- pero eso permite dos PEDs distintos para la misma COT. Necesitamos:
-- "un parent NO puede tener dos children del mismo relation_type 1:1".
--
-- Conversion 1:1 (sólo un child permitido por parent):
--   - 'converted_to'    (canónico v37+: quote → sales_order)
--   - 'quote_to_order'  (legacy todavía usado por cotizador/page.tsx)
--
-- Excluidos (legítimamente 1:N):
--   - 'delivered_as'    (PED → múltiples REM en entregas parciales)
--   - 'invoiced_as'     (PED → múltiples FAC en facturación parcial)
--   - 'paid_by'         (FAC → múltiples cobros)
--   - 'amended_by'      (FAC → múltiples NC/ND)
--   - 'intercompany'    (no es conversión)
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_relations') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_relation_conversion_1to1
      ON public.tt_document_relations (parent_id, relation_type)
      WHERE relation_type IN ('converted_to', 'quote_to_order');

    RAISE NOTICE 'Índice uniq_doc_relation_conversion_1to1 creado sobre tt_document_relations';
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_links') THEN
    -- Fallback: la migración v61 no se aplicó, la tabla sigue llamándose tt_document_links
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_link_conversion_1to1
      ON public.tt_document_links (parent_id, relation_type)
      WHERE relation_type IN ('converted_to', 'quote_to_order');

    RAISE NOTICE 'Índice uniq_doc_link_conversion_1to1 creado sobre tt_document_links (v61 no aplicada)';
  ELSE
    RAISE EXCEPTION 'No existe tt_document_relations ni tt_document_links — revisar migraciones previas';
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, comentado):
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP INDEX IF EXISTS public.uniq_doc_relation_conversion_1to1;
-- DROP INDEX IF EXISTS public.uniq_doc_link_conversion_1to1;
-- DROP TABLE IF EXISTS public.tt_idempotency_keys;
-- COMMIT;
