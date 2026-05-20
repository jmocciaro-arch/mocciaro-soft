-- ============================================================================
-- MIGRACIÓN v82 — RPC get_product_ids_by_stock_filter
-- ============================================================================
-- Devuelve los UUIDs de productos que cumplen un criterio de stock, para
-- usarlos como pre-filtro en la grilla de catálogo (.in('id', ids)).
--
-- Filtros soportados:
--   'with_real'      → tienen sum(tt_stock.quantity) > 0
--   'no_real'        → no tienen stock real (sin filas o sum=0)
--   'with_committed' → tienen items en SO/Albarán con qty pendiente > 0
--   'with_requested' → tienen items en PO/PAP con qty pendiente > 0
-- ============================================================================

CREATE OR REPLACE FUNCTION get_product_ids_by_stock_filter(p_filter TEXT)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  IF p_filter = 'with_real' THEN
    SELECT array_agg(product_id)
      INTO v_ids
    FROM (
      SELECT product_id
      FROM tt_stock
      GROUP BY product_id
      HAVING sum(quantity) > 0
    ) s;

  ELSIF p_filter = 'no_real' THEN
    -- Productos sin filas en tt_stock O con sum=0, y activos no mergeados
    SELECT array_agg(p.id)
      INTO v_ids
    FROM tt_products p
    WHERE p.active = true
      AND p.merged_into_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM tt_stock s
        WHERE s.product_id = p.id AND s.quantity > 0
      );

  ELSIF p_filter = 'with_committed' THEN
    SELECT array_agg(DISTINCT di.product_id)
      INTO v_ids
    FROM tt_document_items di
    JOIN tt_documents d ON d.id = di.document_id
    WHERE di.product_id IS NOT NULL
      AND d.doc_type IN ('pedido', 'sales_order', 'albaran')
      AND coalesce(d.status, '') NOT IN ('delivered','cancelled','closed','rejected')
      AND (di.quantity - coalesce(di.qty_delivered, 0) - coalesce(di.qty_cancelled, 0)) > 0;

  ELSIF p_filter = 'with_requested' THEN
    SELECT array_agg(DISTINCT di.product_id)
      INTO v_ids
    FROM tt_document_items di
    JOIN tt_documents d ON d.id = di.document_id
    WHERE di.product_id IS NOT NULL
      AND d.doc_type IN ('pap', 'purchase_order')
      AND coalesce(d.status, '') NOT IN ('received','cancelled','closed','rejected')
      AND (di.quantity - coalesce(di.qty_received, 0) - coalesce(di.qty_cancelled, 0)) > 0;

  ELSE
    RAISE EXCEPTION 'unknown stock filter: %', p_filter;
  END IF;

  RETURN coalesce(v_ids, ARRAY[]::UUID[]);
END;
$$;

COMMENT ON FUNCTION get_product_ids_by_stock_filter IS
  'Devuelve UUIDs de productos por criterio de stock. Filtros: with_real, no_real, with_committed, with_requested. Diseñado para usarse como pre-filtro en la grilla de catálogo.';
