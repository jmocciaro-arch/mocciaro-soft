-- Migration v54 — Stock transaccional (reserva on order, decrement on delivery)
--
-- WHY: hoy las cotizaciones, pedidos y albaranes no tocan stock.
-- Permite oversell. Hace falta:
--   - Reservar stock al confirmar un pedido.
--   - Liberar la reserva si el pedido se cancela.
--   - Consumir (reserved → out) al despachar un albarán.
--   - Devolver stock al hacer una nota de crédito o devolución.
--
-- Este migration NO conecta automáticamente todavía. Sólo crea la
-- infraestructura (columnas + funciones RPC + tabla de logs). El próximo
-- paso (PR-D) es invocar estas funciones desde el handler de
-- quoteToOrder, orderToDeliveryNote, etc., con un feature flag para
-- activación gradual.
--
-- HOW TO APPLY: Supabase SQL Editor → ejecutar este archivo.
-- Idempotente.

BEGIN;

-- 1. Columna warehouse_id en tt_documents (nullable). Cuando un pedido o
--    albarán se asocia a un almacén específico, el trigger lo usa.
--    Si NULL, las funciones usan el warehouse default de la empresa.
ALTER TABLE tt_documents
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES tt_warehouses(id);
CREATE INDEX IF NOT EXISTS idx_tt_documents_warehouse_id ON tt_documents(warehouse_id);

-- 2. Tabla de transacciones de reserva (audit + permite revert).
CREATE TABLE IF NOT EXISTS tt_stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES tt_documents(id) ON DELETE CASCADE,
  document_item_id UUID REFERENCES tt_document_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES tt_products(id),
  warehouse_id UUID NOT NULL REFERENCES tt_warehouses(id),
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'consumed', 'released', 'cancelled')),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tt_stock_reservations_doc
  ON tt_stock_reservations(document_id);
CREATE INDEX IF NOT EXISTS idx_tt_stock_reservations_active
  ON tt_stock_reservations(product_id, warehouse_id) WHERE status = 'active';

ALTER TABLE tt_stock_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_reservations_authenticated_all" ON tt_stock_reservations;
CREATE POLICY "stock_reservations_authenticated_all"
  ON tt_stock_reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Helper: warehouse default de una empresa (primer activo por código).
CREATE OR REPLACE FUNCTION default_warehouse_for_company(p_company_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tt_warehouses
  WHERE company_id = p_company_id
    AND COALESCE(active, true) = true
  ORDER BY code ASC
  LIMIT 1;
$$;

-- 4. RPC: reservar stock para un documento (típicamente un pedido).
--    Si el doc ya tiene reservas activas, las cancela y crea nuevas
--    (idempotente). Si stock disponible < pedido, lanza warning pero
--    igual reserva (al menos hasta lo disponible). Modo strict opcional.
CREATE OR REPLACE FUNCTION reserve_stock_for_document(
  p_document_id UUID,
  p_strict BOOLEAN DEFAULT false
)
RETURNS TABLE(
  product_id UUID,
  warehouse_id UUID,
  requested_qty NUMERIC,
  reserved_qty NUMERIC,
  available_qty NUMERIC,
  shortfall NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc RECORD;
  v_warehouse_id UUID;
  v_item RECORD;
  v_stock RECORD;
  v_reserve NUMERIC;
  v_shortfall NUMERIC;
BEGIN
  SELECT * INTO v_doc FROM tt_documents WHERE id = p_document_id;
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'Documento % no encontrado', p_document_id;
  END IF;

  v_warehouse_id := COALESCE(v_doc.warehouse_id, default_warehouse_for_company(v_doc.company_id));
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar warehouse (doc.warehouse_id NULL y company sin warehouses activos)';
  END IF;

  -- Cancelar reservas previas activas del doc (idempotencia)
  UPDATE tt_stock_reservations
  SET status = 'cancelled', released_at = now(),
      notes = COALESCE(notes, '') || ' [reemplazada por nueva reserva]'
  WHERE document_id = p_document_id AND status = 'active';

  -- Devolver lo que estaba reservado al pool disponible
  UPDATE tt_stock s
  SET reserved = GREATEST(0, s.reserved - r.quantity), updated_at = now()
  FROM tt_stock_reservations r
  WHERE r.document_id = p_document_id
    AND r.status = 'cancelled'
    AND r.released_at = now() -- solo las que cancelamos arriba
    AND s.product_id = r.product_id
    AND s.warehouse_id = r.warehouse_id;

  -- Crear nuevas reservas por cada item del doc.
  FOR v_item IN
    SELECT i.id AS item_id, i.product_id, i.quantity
    FROM tt_document_items i
    WHERE i.document_id = p_document_id
      AND i.product_id IS NOT NULL
      AND i.quantity > 0
  LOOP
    -- Stock actual con UPSERT row si no existe
    SELECT * INTO v_stock
    FROM tt_stock
    WHERE product_id = v_item.product_id AND warehouse_id = v_warehouse_id
    FOR UPDATE;

    IF v_stock IS NULL THEN
      INSERT INTO tt_stock (product_id, warehouse_id, quantity, reserved, min_quantity, updated_at)
      VALUES (v_item.product_id, v_warehouse_id, 0, 0, 0, now())
      RETURNING * INTO v_stock;
    END IF;

    -- Cuanto puedo reservar = min(pedido, disponible)
    v_reserve := LEAST(v_item.quantity, GREATEST(0, v_stock.quantity - v_stock.reserved));
    v_shortfall := v_item.quantity - v_reserve;

    IF p_strict AND v_shortfall > 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %: pedido=%, disponible=%',
        v_item.product_id, v_item.quantity, GREATEST(0, v_stock.quantity - v_stock.reserved);
    END IF;

    -- Crear la reserva (incluso si shortfall > 0, reservamos lo que hay)
    IF v_reserve > 0 THEN
      INSERT INTO tt_stock_reservations
        (document_id, document_item_id, product_id, warehouse_id, quantity, notes)
      VALUES
        (p_document_id, v_item.item_id, v_item.product_id, v_warehouse_id, v_reserve,
         CASE WHEN v_shortfall > 0
              THEN format('Reservado parcial: faltaron %s', v_shortfall)
              ELSE NULL END);

      UPDATE tt_stock
      SET reserved = reserved + v_reserve, updated_at = now()
      WHERE id = v_stock.id;
    END IF;

    RETURN QUERY SELECT
      v_item.product_id,
      v_warehouse_id,
      v_item.quantity,
      v_reserve,
      GREATEST(0, v_stock.quantity - v_stock.reserved),
      v_shortfall;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION reserve_stock_for_document IS 'Reserva stock para un documento (típicamente pedido). Idempotente: si ya había reservas activas, las cancela y crea nuevas. p_strict=true falla si no hay stock; default false reserva lo que se pueda.';

-- 5. RPC: liberar reservas (cancelación de pedido).
CREATE OR REPLACE FUNCTION release_stock_for_document(p_document_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_resv RECORD;
BEGIN
  FOR v_resv IN
    SELECT * FROM tt_stock_reservations
    WHERE document_id = p_document_id AND status = 'active'
    FOR UPDATE
  LOOP
    UPDATE tt_stock
    SET reserved = GREATEST(0, reserved - v_resv.quantity), updated_at = now()
    WHERE product_id = v_resv.product_id AND warehouse_id = v_resv.warehouse_id;

    UPDATE tt_stock_reservations
    SET status = 'released',
        released_at = now(),
        notes = COALESCE(notes, '') || COALESCE(' [' || p_reason || ']', '')
    WHERE id = v_resv.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION release_stock_for_document IS 'Libera todas las reservas activas de un documento (típicamente al cancelar pedido).';

-- 6. RPC: consumir reservas (al despachar albarán).
--    Por cada item entregado, busca reserva activa y la marca como
--    consumida; decrementa quantity y reserved del stock.
CREATE OR REPLACE FUNCTION consume_stock_for_delivery(
  p_source_document_id UUID,
  p_items JSONB
)
RETURNS TABLE(
  product_id UUID,
  warehouse_id UUID,
  consumed_qty NUMERIC,
  remaining_reservation NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_product UUID;
  v_qty NUMERIC;
  v_resv RECORD;
  v_consume NUMERIC;
  v_remaining NUMERIC;
  v_total_consumed NUMERIC;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_product IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    v_total_consumed := 0;

    -- Buscar reservas activas FIFO
    FOR v_resv IN
      SELECT * FROM tt_stock_reservations
      WHERE document_id = p_source_document_id
        AND product_id = v_product
        AND status = 'active'
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      v_consume := LEAST(v_qty - v_total_consumed, v_resv.quantity);
      IF v_consume <= 0 THEN EXIT; END IF;

      UPDATE tt_stock
      SET quantity = GREATEST(0, quantity - v_consume),
          reserved = GREATEST(0, reserved - v_consume),
          updated_at = now()
      WHERE product_id = v_resv.product_id AND warehouse_id = v_resv.warehouse_id;

      IF v_consume = v_resv.quantity THEN
        UPDATE tt_stock_reservations
        SET status = 'consumed', consumed_at = now()
        WHERE id = v_resv.id;
        v_remaining := 0;
      ELSE
        UPDATE tt_stock_reservations
        SET quantity = quantity - v_consume
        WHERE id = v_resv.id;
        v_remaining := v_resv.quantity - v_consume;
      END IF;

      v_total_consumed := v_total_consumed + v_consume;
      RETURN QUERY SELECT v_resv.product_id, v_resv.warehouse_id, v_consume, v_remaining;

      IF v_total_consumed >= v_qty THEN EXIT; END IF;
    END LOOP;

    -- Si después de consumir todas las reservas todavía falta, decrementar
    -- directo (overdraft que quedará en negativo si no había stock).
    IF v_total_consumed < v_qty THEN
      DECLARE
        v_default_wh UUID;
        v_doc_company UUID;
      BEGIN
        SELECT company_id INTO v_doc_company FROM tt_documents WHERE id = p_source_document_id;
        v_default_wh := default_warehouse_for_company(v_doc_company);

        UPDATE tt_stock
        SET quantity = quantity - (v_qty - v_total_consumed), updated_at = now()
        WHERE product_id = v_product AND warehouse_id = v_default_wh;

        RETURN QUERY SELECT v_product, v_default_wh, v_qty - v_total_consumed, NULL::NUMERIC;
      END;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION consume_stock_for_delivery IS 'Consume reservas de un pedido al despachar. p_items es jsonb array [{product_id, quantity}]. FIFO sobre reservas activas; si falta, decrementa stock directo (puede dejar negativo).';

COMMIT;
