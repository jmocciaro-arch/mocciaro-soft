-- v89: RPC transaccional para traspasos de stock entre almacenes
-- Reemplaza el handleTransfer del cliente que hacía 2 inserts + 2 updates separados
-- (race condition: fallo parcial dejaba stock incoherente).

-- Función: fn_transfer_stock
-- Hace todo en una transacción implícita PLPGSQL:
--   1. Verifica stock suficiente en origen (con SELECT ... FOR UPDATE para evitar concurrencia)
--   2. Decrementa stock origen
--   3. Incrementa stock destino (INSERT si no existe la fila)
--   4. Inserta 2 movements: traspaso_salida + traspaso_entrada (con sub-tipo en la columna movement_type)
-- Si cualquier paso falla → ROLLBACK automático (Postgres revierte la función completa).

CREATE OR REPLACE FUNCTION fn_transfer_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_from_warehouse uuid,
  p_to_warehouse uuid,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS TABLE (
  movement_out_id uuid,
  movement_in_id uuid,
  qty_origin_before numeric,
  qty_origin_after numeric,
  qty_dest_before numeric,
  qty_dest_after numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_origin_stock_id uuid;
  v_origin_qty_before numeric;
  v_origin_qty_after numeric;
  v_dest_stock_id uuid;
  v_dest_qty_before numeric;
  v_dest_qty_after numeric;
  v_mov_out_id uuid;
  v_mov_in_id uuid;
  v_ref text;
BEGIN
  -- Validaciones básicas
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;
  IF p_from_warehouse = p_to_warehouse THEN
    RAISE EXCEPTION 'Origen y destino no pueden ser iguales';
  END IF;

  -- 1) Lock fila origen + verificar stock disponible
  --    FOR UPDATE bloquea concurrencia con otros traspasos del mismo product+warehouse
  SELECT id, quantity INTO v_origin_stock_id, v_origin_qty_before
  FROM tt_stock
  WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay stock para este producto en el almacén origen';
  END IF;

  IF v_origin_qty_before < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente en origen: % disponible, % solicitado', v_origin_qty_before, p_quantity;
  END IF;

  v_origin_qty_after := v_origin_qty_before - p_quantity;

  -- 2) Decrementar origen
  UPDATE tt_stock SET quantity = v_origin_qty_after WHERE id = v_origin_stock_id;

  -- 3) Lock fila destino (si existe) o INSERT
  SELECT id, quantity INTO v_dest_stock_id, v_dest_qty_before
  FROM tt_stock
  WHERE product_id = p_product_id AND warehouse_id = p_to_warehouse
  FOR UPDATE;

  IF FOUND THEN
    v_dest_qty_after := v_dest_qty_before + p_quantity;
    UPDATE tt_stock SET quantity = v_dest_qty_after WHERE id = v_dest_stock_id;
  ELSE
    v_dest_qty_before := 0;
    v_dest_qty_after := p_quantity;
    INSERT INTO tt_stock(product_id, warehouse_id, quantity, reserved, min_quantity)
    VALUES (p_product_id, p_to_warehouse, p_quantity, 0, 0);
  END IF;

  -- 4) Insertar 2 movements
  v_ref := COALESCE(p_reference, 'Traspaso ' || p_from_warehouse || ' -> ' || p_to_warehouse);

  INSERT INTO tt_stock_movements(
    product_id, warehouse_id, movement_type, quantity,
    quantity_before, quantity_after, reference, notes
  ) VALUES (
    p_product_id, p_from_warehouse, 'traspaso_salida', p_quantity,
    v_origin_qty_before, v_origin_qty_after, v_ref,
    COALESCE(p_notes, 'Salida por traspaso')
  ) RETURNING id INTO v_mov_out_id;

  INSERT INTO tt_stock_movements(
    product_id, warehouse_id, movement_type, quantity,
    quantity_before, quantity_after, reference, notes
  ) VALUES (
    p_product_id, p_to_warehouse, 'traspaso_entrada', p_quantity,
    v_dest_qty_before, v_dest_qty_after, v_ref,
    COALESCE(p_notes, 'Entrada por traspaso')
  ) RETURNING id INTO v_mov_in_id;

  -- 5) Devolver IDs y cantidades para que el cliente actualice UI
  RETURN QUERY SELECT
    v_mov_out_id, v_mov_in_id,
    v_origin_qty_before, v_origin_qty_after,
    v_dest_qty_before, v_dest_qty_after;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION fn_transfer_stock(uuid, numeric, uuid, uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_transfer_stock(uuid, numeric, uuid, uuid, text, text) FROM anon, public;

-- INSTRUCCIONES DE APLICACIÓN:
-- 1) Aplicar via psql o SQL Editor de Supabase:
--    psql $DATABASE_URL -f supabase/migrations/v89_fn_transfer_stock.sql
-- 2) Smoke test después de aplicar:
--    SELECT * FROM fn_transfer_stock(
--      '<product_uuid>'::uuid,
--      1::numeric,
--      '<warehouse_origin_uuid>'::uuid,
--      '<warehouse_dest_uuid>'::uuid,
--      'Test traspaso',
--      'Notas opcionales'
--    );
--    Debería devolver una fila con movement_out_id, movement_in_id, qty_origin_before/after, qty_dest_before/after.
--
-- 3) ROLLBACK si rompe:
--    DROP FUNCTION fn_transfer_stock(uuid, numeric, uuid, uuid, text, text);
--
-- IMPORTANTE:
-- - Si tt_stock_movements no tiene los valores 'traspaso_salida'/'traspaso_entrada' en su CHECK constraint
--   o en algún enum, esta migración va a fallar. Hay 2 opciones:
--   a) Si movement_type es text libre: andará directo.
--   b) Si es enum o CHECK: agregar los valores antes:
--      ALTER TABLE tt_stock_movements DROP CONSTRAINT IF EXISTS tt_stock_movements_movement_type_check;
--      ALTER TABLE tt_stock_movements ADD CONSTRAINT tt_stock_movements_movement_type_check
--        CHECK (movement_type IN ('entrada','salida','traspaso','traspaso_salida','traspaso_entrada','ajuste','reserve','egress'));
--   El handleTransfer cliente del ERP usa 'traspaso' (sin direccionalidad) — si querés mantener compat con
--   reportes históricos, podés usar 'traspaso' acá también (perdés el delta direccional pero no rompés nada).
