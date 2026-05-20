-- ============================================================================
-- MIGRACIÓN v81 — RPC get_product_stock_breakdown
-- ============================================================================
-- Para una lista de productos, devuelve por cada uno:
--   - stock_real:      sum(tt_stock.quantity) total + desglose por warehouse
--   - stock_committed: lo vendido pero no entregado (SO/albarán pendiente)
--                      + detalle por documento (cliente, qty, ETA)
--   - stock_requested: lo pedido a proveedor pero no recibido (PO/PAP pendiente)
--                      + detalle por documento (proveedor, qty, ETA)
--   - movements:       últimos N movimientos de stock
--
-- Doc types considerados (basados en uso real del repo):
--   SO/Albarán:  'pedido', 'sales_order', 'albaran'
--   PO/PAP:      'pap', 'purchase_order'
--
-- Estado pendiente: documento NO está en estado final
--   ('delivered','cancelled','closed','received','paid','rejected')
-- ============================================================================

CREATE OR REPLACE FUNCTION get_product_stock_breakdown(
  p_product_ids UUID[],
  p_movements_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(p.id::text, p.payload)
    INTO v_result
  FROM (
    SELECT
      p.id,
      jsonb_build_object(
        'product_id', p.id,
        'sku', p.sku,
        'name', p.name,
        'stock_real_total', (
          SELECT coalesce(sum(quantity), 0)::numeric
          FROM tt_stock WHERE product_id = p.id
        ),
        'stock_real_by_warehouse', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'warehouse_id', s.warehouse_id,
            'warehouse_name', w.name,
            'company_id', w.company_id,
            'company_name', c.name,
            'quantity', s.quantity,
            'reserved', s.reserved,
            'available', s.quantity - coalesce(s.reserved, 0)
          ) ORDER BY w.name), '[]'::jsonb)
          FROM tt_stock s
          LEFT JOIN tt_warehouses w ON w.id = s.warehouse_id
          LEFT JOIN tt_companies c ON c.id = w.company_id
          WHERE s.product_id = p.id
        ),
        'stock_committed_total', coalesce((
          SELECT sum(greatest(di.quantity - coalesce(di.qty_delivered, 0) - coalesce(di.qty_cancelled, 0), 0))
          FROM tt_document_items di
          JOIN tt_documents d ON d.id = di.document_id
          WHERE di.product_id = p.id
            AND d.doc_type IN ('pedido', 'sales_order', 'albaran')
            AND coalesce(d.status, '') NOT IN ('delivered','cancelled','closed','rejected')
            AND (di.quantity - coalesce(di.qty_delivered, 0) - coalesce(di.qty_cancelled, 0)) > 0
        ), 0),
        'stock_committed_detail', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'document_id', d.id,
            'doc_type', d.doc_type,
            'system_code', d.system_code,
            'display_ref', d.display_ref,
            'status', d.status,
            'client_id', d.client_id,
            'client_name', cl.name,
            'company_id', d.company_id,
            'company_name', co.name,
            'qty_pending', greatest(di.quantity - coalesce(di.qty_delivered, 0) - coalesce(di.qty_cancelled, 0), 0),
            'qty_total', di.quantity,
            'qty_delivered', coalesce(di.qty_delivered, 0),
            'eta', d.delivery_date,
            'created_at', d.created_at
          ) ORDER BY d.delivery_date NULLS LAST, d.created_at)
          FROM tt_document_items di
          JOIN tt_documents d ON d.id = di.document_id
          LEFT JOIN tt_clients cl ON cl.id = d.client_id
          LEFT JOIN tt_companies co ON co.id = d.company_id
          WHERE di.product_id = p.id
            AND d.doc_type IN ('pedido', 'sales_order', 'albaran')
            AND coalesce(d.status, '') NOT IN ('delivered','cancelled','closed','rejected')
            AND (di.quantity - coalesce(di.qty_delivered, 0) - coalesce(di.qty_cancelled, 0)) > 0
        ), '[]'::jsonb),
        'stock_requested_total', coalesce((
          SELECT sum(greatest(di.quantity - coalesce(di.qty_received, 0) - coalesce(di.qty_cancelled, 0), 0))
          FROM tt_document_items di
          JOIN tt_documents d ON d.id = di.document_id
          WHERE di.product_id = p.id
            AND d.doc_type IN ('pap', 'purchase_order')
            AND coalesce(d.status, '') NOT IN ('received','cancelled','closed','rejected')
            AND (di.quantity - coalesce(di.qty_received, 0) - coalesce(di.qty_cancelled, 0)) > 0
        ), 0),
        'stock_requested_detail', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'document_id', d.id,
            'doc_type', d.doc_type,
            'system_code', d.system_code,
            'display_ref', d.display_ref,
            'status', d.status,
            'client_id', d.client_id,  -- en compras el "client" suele ser el supplier
            'supplier_name', sup.name,
            'company_id', d.company_id,
            'company_name', co.name,
            'qty_pending', greatest(di.quantity - coalesce(di.qty_received, 0) - coalesce(di.qty_cancelled, 0), 0),
            'qty_total', di.quantity,
            'qty_received', coalesce(di.qty_received, 0),
            'eta', d.delivery_date,
            'created_at', d.created_at
          ) ORDER BY d.delivery_date NULLS LAST, d.created_at)
          FROM tt_document_items di
          JOIN tt_documents d ON d.id = di.document_id
          LEFT JOIN tt_clients sup ON sup.id = d.client_id  -- adjust si hay tabla suppliers separada
          LEFT JOIN tt_companies co ON co.id = d.company_id
          WHERE di.product_id = p.id
            AND d.doc_type IN ('pap', 'purchase_order')
            AND coalesce(d.status, '') NOT IN ('received','cancelled','closed','rejected')
            AND (di.quantity - coalesce(di.qty_received, 0) - coalesce(di.qty_cancelled, 0)) > 0
        ), '[]'::jsonb),
        'movements', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', sm.id,
            'created_at', sm.created_at,
            'movement_type', sm.movement_type,
            'quantity', sm.quantity,
            'quantity_before', sm.quantity_before,
            'quantity_after', sm.quantity_after,
            'warehouse_id', sm.warehouse_id,
            'warehouse_name', w.name,
            'document_id', sm.document_id,
            'document_code', d.system_code,
            'reference', sm.reference,
            'notes', sm.notes,
            'expected_arrival', sm.expected_arrival
          ) ORDER BY sm.created_at DESC)
          FROM (
            SELECT * FROM tt_stock_movements
            WHERE product_id = p.id
            ORDER BY created_at DESC
            LIMIT p_movements_limit
          ) sm
          LEFT JOIN tt_warehouses w ON w.id = sm.warehouse_id
          LEFT JOIN tt_documents d ON d.id = sm.document_id
        ), '[]'::jsonb)
      ) AS payload
    FROM tt_products p
    WHERE p.id = ANY(p_product_ids)
  ) p;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION get_product_stock_breakdown IS
  'Devuelve breakdown de stock por producto: real (con warehouses), comprometido (SO/albarán pendiente), solicitado (PO/PAP pendiente), y últimos movimientos. Input: array de UUIDs, output: jsonb {product_id → payload}.';

-- Crear suppliers join opcional — si existe tabla tt_suppliers separada, mejor
-- usarla. Por ahora asumimos que en compras d.client_id apunta a tt_clients
-- con flag is_supplier (común en ERPs simples).
