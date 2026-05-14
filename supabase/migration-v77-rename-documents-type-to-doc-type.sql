-- ============================================================================
-- MIGRACIÓN v77 — Renombrar tt_documents.type → tt_documents.doc_type
-- Aplicada: 2026-05-14
-- ============================================================================
-- El código del ERP asume el nombre 'doc_type' en 30+ queries (cotizador,
-- ventas, compras, APIs de IA, /api/oc/parse, etc.) pero la columna real
-- se llamaba 'type'. Esto causaba un error al importar OC:
--   "Could not find the 'doc_type' column of 'tt_documents'"
--
-- Renombrar la columna es menos riesgoso que cambiar 30+ queries y deja
-- el schema más descriptivo ('type' es ambiguo).
--
-- El índice idx_tt_docs_type sigue apuntando a la misma columna (PostgreSQL
-- actualiza las referencias automáticamente al renombrar).
-- ============================================================================

ALTER TABLE public.tt_documents RENAME COLUMN "type" TO doc_type;

COMMENT ON COLUMN public.tt_documents.doc_type IS
  'Tipo de documento: coti, pedido, delivery_note, factura, pap, recepcion, factura_compra, etc.';
