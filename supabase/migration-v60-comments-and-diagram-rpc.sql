-- ════════════════════════════════════════════════════════════════════════
-- Migration v60 — Comentarios en tablas legacy + RPC para ER diagram
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY: dos cosas chicas pero importantes para el dev externo:
--
--  (1) Marcar las tablas legacy con COMMENT ON TABLE para que cualquiera
--      que use psql `\d tt_*` vea inmediatamente que están deprecated y
--      no debe escribir en ellas (refuerza la regla de CLAUDE.md §3.6).
--
--  (2) Crear la función `get_tt_columns_for_diagram()` que usa
--      scripts/db-diagram.ts para generar el ER diagram desde
--      information_schema. SECURITY DEFINER porque PostgREST por
--      default no expone information_schema a service_role.
--
-- HOW TO APPLY: SQL Editor. Idempotente.
-- ROLLBACK: ver al final.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Comentarios en tablas legacy (marcar como deprecated)
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE tt_quotes IS
  'DEPRECATED — usar tt_documents(doc_type=quote). NO escribir en esta tabla. Migración pendiente: Fase 1.4 del PLAN-REFACTOR. Se borra en v66 después de coexistencia validada.';

COMMENT ON TABLE tt_quote_items IS
  'DEPRECATED — usar tt_document_lines (con tt_documents.doc_type=quote como padre). NO escribir. Migración: Fase 1.4. Drop en v66.';

COMMENT ON TABLE tt_sales_orders IS
  'DEPRECATED — usar tt_documents(doc_type=sales_order). NO escribir. Migración: Fase 1.5. Drop en v66.';

COMMENT ON TABLE tt_so_items IS
  'DEPRECATED — usar tt_document_lines (con tt_documents.doc_type=sales_order como padre). NO escribir. Migración: Fase 1.5. Drop en v66.';

COMMENT ON TABLE tt_document_items IS
  'DEPRECATED (legacy híbrido) — usar tt_document_lines (modelo unificado). Tiene 11 campos operativos extra que tt_document_lines NO tenía hasta v57 (qty_reserved, requires_po, po_*, warehouse_id, oc_line_ref, etc). Migración de datos: Fase 1.3 del PLAN-REFACTOR. NO escribir.';

COMMENT ON TABLE tt_document_links IS
  'DEPRECATED (legacy) — usar tt_document_relations con relation_type tipado. NO escribir.';

COMMENT ON TABLE tt_oc_parsed IS
  'DEPRECATED (outlier IA) — la OC parseada se mueve a attachment + metadata de tt_documents (Fase 1.2 del PLAN-REFACTOR). NO escribir nuevas filas. Las existentes quedan como histórico read-only.';

-- Tablas operativas que SÍ se usan, pero con notas:

COMMENT ON TABLE tt_documents IS
  'Modelo unificado nuevo (v37). Una sola tabla para quote, sales_order, delivery_note, invoice, proforma, receipt, credit_note, debit_note, purchase_order, internal. Ver doc_type, status, direction, counterparty_*. Tiene RLS activable (v56) — habilitar después de validar.';

COMMENT ON TABLE tt_document_lines IS
  'Líneas del modelo unificado. Snapshot de producto + cálculos + derivación. Triggers: fn_protect_lines_on_locked_doc (v38) impide modificar campos comerciales tras emisión, fn_recompute_document_totals recalcula totales del padre. Extendida en v57 con 13 campos operativos.';

COMMENT ON TABLE tt_document_relations IS
  'Cadena de derivación tipada (converted_to, delivered_as, invoiced_as, etc). Reemplaza tt_document_links.';

COMMENT ON TABLE tt_document_events IS
  'Bitácora append-only de eventos del documento. INMUTABLE a nivel DB (v38). REVOKE UPDATE/DELETE para authenticated. Particionar por año tras 2 años de uso (Fase 3.7).';

COMMENT ON TABLE tt_stock_reservations IS
  'Reservas atómicas de stock por documento (v54). Status: active|consumed|released|cancelled. Liga document_id, document_item_id, product_id, warehouse_id. RLS endurecida en v55 (piloto).';

-- ─────────────────────────────────────────────────────────────────────
-- 2. RPC para que scripts/db-diagram.ts pueda inspeccionar schema
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_tt_columns_for_diagram()
RETURNS TABLE(
  table_name text,
  column_name text,
  data_type text,
  is_nullable text,
  column_default text,
  ordinal_position integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, information_schema
AS $$
  SELECT
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text,
    c.column_default::text,
    c.ordinal_position::int
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name LIKE 'tt\_%' ESCAPE '\'
  ORDER BY c.table_name, c.ordinal_position;
$$;

REVOKE EXECUTE ON FUNCTION get_tt_columns_for_diagram() FROM PUBLIC, anon, authenticated;
-- service_role sigue teniendo execute por default (lo usa scripts/db-diagram.ts).

COMMENT ON FUNCTION get_tt_columns_for_diagram() IS
  'Helper para scripts/db-diagram.ts. Devuelve columnas de tablas tt_* desde information_schema. SECURITY DEFINER porque PostgREST por default no expone information_schema.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP FUNCTION IF EXISTS get_tt_columns_for_diagram();
-- COMMENT ON TABLE tt_quotes IS NULL;
-- COMMENT ON TABLE tt_quote_items IS NULL;
-- COMMENT ON TABLE tt_sales_orders IS NULL;
-- COMMENT ON TABLE tt_so_items IS NULL;
-- COMMENT ON TABLE tt_document_items IS NULL;
-- COMMENT ON TABLE tt_document_links IS NULL;
-- COMMENT ON TABLE tt_oc_parsed IS NULL;
-- COMMENT ON TABLE tt_documents IS NULL;
-- COMMENT ON TABLE tt_document_lines IS NULL;
-- COMMENT ON TABLE tt_document_relations IS NULL;
-- COMMENT ON TABLE tt_document_events IS NULL;
-- COMMENT ON TABLE tt_stock_reservations IS NULL;
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════
