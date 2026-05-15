-- ============================================================================
-- MIGRACIÓN v78 — Columnas faltantes en tt_oc_parsed
-- Aplicada: 2026-05-14
-- ============================================================================
-- La API /api/oc/parse insertaba ai_provider, ai_discrepancies y
-- matched_quote_id, pero esas columnas no existían en el schema —
-- rompía la importación de OC con:
--   "Could not find the 'ai_discrepancies' column of 'tt_oc_parsed'"
-- ============================================================================

ALTER TABLE public.tt_oc_parsed
  ADD COLUMN IF NOT EXISTS ai_provider TEXT,
  ADD COLUMN IF NOT EXISTS ai_discrepancies JSONB,
  ADD COLUMN IF NOT EXISTS matched_quote_id UUID REFERENCES public.tt_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tt_oc_parsed_matched_quote
  ON public.tt_oc_parsed (matched_quote_id);

COMMENT ON COLUMN public.tt_oc_parsed.ai_provider IS
  'Proveedor de IA que parseó el PDF (anthropic, openai, etc.)';
COMMENT ON COLUMN public.tt_oc_parsed.ai_discrepancies IS
  'Array JSON de discrepancias detectadas entre la OC parseada y la cotización vinculada (severity, detail, etc.)';
COMMENT ON COLUMN public.tt_oc_parsed.matched_quote_id IS
  'FK opcional al documento de cotización con el que se cruzó la OC.';
