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
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;
  IF p_from_warehouse = p_to_warehouse THEN
    RAISE EXCEPTION 'Origen y destino no pueden ser iguales';
  END IF;

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
  UPDATE tt_stock SET quantity = v_origin_qty_after WHERE id = v_origin_stock_id;

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

  RETURN QUERY SELECT
    v_mov_out_id, v_mov_in_id,
    v_origin_qty_before, v_origin_qty_after,
    v_dest_qty_before, v_dest_qty_after;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_transfer_stock(uuid, numeric, uuid, uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_transfer_stock(uuid, numeric, uuid, uuid, text, text) FROM anon, public;
