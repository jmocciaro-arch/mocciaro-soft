-- ════════════════════════════════════════════════════════════════════════
-- Migration v64 — Agregar columnas faltantes a tt_oc_parsed
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY:
--   El endpoint /api/oc/parse intenta insertar columnas que no existen
--   en tt_oc_parsed (ai_provider, ai_discrepancies, matched_quote_id,
--   deletion_status, deletion_reason). PostgreSQL rechaza el INSERT,
--   pero el código del endpoint no chequea el error → ocParsedId queda
--   undefined → el flujo "Importar OC desde Cotizador" falla con toast
--   "No se pudo identificar la OC parseada".
--
--   Agregamos las columnas que el código TS y el frontend ya usan.
--
-- HOW TO APPLY:
--   Pegar este archivo en Supabase SQL Editor → Run.
--   Idempotente: usa ADD COLUMN IF NOT EXISTS.
--
-- ROLLBACK:
--   Ver bloque al final del archivo.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Provider de IA usado para parsear (claude, gemini, openai, etc.)
ALTER TABLE public.tt_oc_parsed
  ADD COLUMN IF NOT EXISTS ai_provider TEXT;

-- 2. Discrepancias detectadas al comparar la OC con la cotización
ALTER TABLE public.tt_oc_parsed
  ADD COLUMN IF NOT EXISTS ai_discrepancies JSONB DEFAULT '[]'::jsonb;

-- 3. Cotización con la que se matcheó la OC (FK opcional)
ALTER TABLE public.tt_oc_parsed
  ADD COLUMN IF NOT EXISTS matched_quote_id UUID REFERENCES public.tt_documents(id) ON DELETE SET NULL;

-- 4. Estado de eliminación (soft-delete con request/aprobación)
ALTER TABLE public.tt_oc_parsed
  ADD COLUMN IF NOT EXISTS deletion_status TEXT DEFAULT 'active'
    CHECK (deletion_status IN ('active','deletion_requested','deleted'));

-- 5. Motivo declarado al pedir eliminación
ALTER TABLE public.tt_oc_parsed
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- 6. created_at por consistencia (ya debería existir, pero por las dudas)
ALTER TABLE public.tt_oc_parsed
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────
-- Índices útiles
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tt_oc_parsed_matched_quote
  ON public.tt_oc_parsed(matched_quote_id)
  WHERE matched_quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tt_oc_parsed_deletion_status
  ON public.tt_oc_parsed(deletion_status);

CREATE INDEX IF NOT EXISTS idx_tt_oc_parsed_created_at
  ON public.tt_oc_parsed(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.tt_oc_parsed.ai_provider IS
  'Proveedor de IA usado para parsear el PDF (claude, gemini, openai, manual)';
COMMENT ON COLUMN public.tt_oc_parsed.ai_discrepancies IS
  'Array de discrepancias detectadas al comparar la OC con la cotización: [{severity, detail, ...}]';
COMMENT ON COLUMN public.tt_oc_parsed.matched_quote_id IS
  'Cotización con la que se matcheó la OC. FK a tt_documents(id).';
COMMENT ON COLUMN public.tt_oc_parsed.deletion_status IS
  'Soft-delete state: active | deletion_requested | deleted';
COMMENT ON COLUMN public.tt_oc_parsed.deletion_reason IS
  'Motivo declarado por quien pidió eliminar la OC';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK DOCUMENTADO
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE public.tt_oc_parsed DROP COLUMN IF EXISTS ai_provider;
-- ALTER TABLE public.tt_oc_parsed DROP COLUMN IF EXISTS ai_discrepancies;
-- ALTER TABLE public.tt_oc_parsed DROP COLUMN IF EXISTS matched_quote_id;
-- ALTER TABLE public.tt_oc_parsed DROP COLUMN IF EXISTS deletion_status;
-- ALTER TABLE public.tt_oc_parsed DROP COLUMN IF EXISTS deletion_reason;
-- DROP INDEX IF EXISTS idx_tt_oc_parsed_matched_quote;
-- DROP INDEX IF EXISTS idx_tt_oc_parsed_deletion_status;
-- DROP INDEX IF EXISTS idx_tt_oc_parsed_created_at;
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════
