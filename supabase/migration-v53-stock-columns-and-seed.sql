-- Migration v53 — Estabilización de stock (BUG2)
--
-- WHY:
--   - tt_stock estaba prácticamente vacía en producción (5 filas para
--     12.325 productos × 3 warehouses) → módulo /stock no servía.
--   - El handler handleAjusteSubmit en /stock/page.tsx intentaba insertar
--     quantity_before y quantity_after en tt_stock_movements pero esas
--     columnas no existían → INSERT del movimiento fallaba silently.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → ejecutar este archivo.
-- Idempotente: si las columnas ya existen, las deja como están.
--
-- NO modifica datos existentes. La inicialización masiva de stock se hace
-- desde la UI con el botón "Inicializar stock" llamando al RPC
-- seed_stock_for_company(p_company_id).

BEGIN;

-- 1. Sumar columnas que el handler de ajuste manual ya intenta insertar.
ALTER TABLE tt_stock_movements
  ADD COLUMN IF NOT EXISTS quantity_before NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS quantity_after NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES tt_users(id);

-- 2. Index para historial por producto.
CREATE INDEX IF NOT EXISTS idx_tt_stock_movements_product
  ON tt_stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tt_stock_movements_warehouse
  ON tt_stock_movements(warehouse_id, created_at DESC);

-- 3. Constraint UNIQUE en (product_id, warehouse_id) si no existe — para
--    evitar duplicados de stock para mismo producto+almacén.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tt_stock'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%product_id%warehouse_id%'
  ) THEN
    BEGIN
      ALTER TABLE tt_stock
        ADD CONSTRAINT tt_stock_product_warehouse_unique
        UNIQUE (product_id, warehouse_id);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      RAISE NOTICE 'Constraint tt_stock_product_warehouse_unique no se pudo crear (duplicados existentes?). Revisar tt_stock.';
    END;
  END IF;
END $$;

-- 4. RPC para inicializar stock = 0 para todos los productos × warehouses
--    de una empresa. No sobrescribe filas existentes (ON CONFLICT DO NOTHING).
CREATE OR REPLACE FUNCTION seed_stock_for_company(p_company_id UUID)
RETURNS TABLE(rows_inserted INT, products_count INT, warehouses_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT;
  v_products INT;
  v_warehouses INT;
BEGIN
  -- Conteo previo
  SELECT count(*) INTO v_products FROM tt_products WHERE active = true;
  SELECT count(*) INTO v_warehouses FROM tt_warehouses
    WHERE company_id = p_company_id AND COALESCE(active, true) = true;

  IF v_warehouses = 0 THEN
    RAISE EXCEPTION 'La empresa % no tiene warehouses activos', p_company_id;
  END IF;

  -- INSERT con ON CONFLICT (no pisa cantidades existentes)
  WITH inserted AS (
    INSERT INTO tt_stock (product_id, warehouse_id, quantity, reserved, min_quantity, updated_at)
    SELECT
      p.id,
      w.id,
      0,
      0,
      0,
      now()
    FROM tt_products p
    CROSS JOIN tt_warehouses w
    WHERE p.active = true
      AND w.company_id = p_company_id
      AND COALESCE(w.active, true) = true
    ON CONFLICT (product_id, warehouse_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN QUERY SELECT v_inserted, v_products, v_warehouses;
END;
$$;

COMMENT ON FUNCTION seed_stock_for_company IS 'Inicializa filas tt_stock=0 para todos los productos × warehouses de una empresa. Idempotente (ON CONFLICT). Requiere constraint UNIQUE(product_id, warehouse_id).';

-- 5. RPC para conteo rápido del estado del stock por empresa.
CREATE OR REPLACE FUNCTION stock_summary_for_company(p_company_id UUID)
RETURNS TABLE(
  warehouses_count INT,
  products_count INT,
  stock_rows_count INT,
  rows_with_quantity_count INT,
  rows_with_zero_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM tt_warehouses WHERE company_id = p_company_id AND COALESCE(active, true) = true) AS warehouses_count,
    (SELECT count(*)::int FROM tt_products WHERE active = true) AS products_count,
    (SELECT count(*)::int FROM tt_stock s
       JOIN tt_warehouses w ON w.id = s.warehouse_id
       WHERE w.company_id = p_company_id) AS stock_rows_count,
    (SELECT count(*)::int FROM tt_stock s
       JOIN tt_warehouses w ON w.id = s.warehouse_id
       WHERE w.company_id = p_company_id AND s.quantity > 0) AS rows_with_quantity_count,
    (SELECT count(*)::int FROM tt_stock s
       JOIN tt_warehouses w ON w.id = s.warehouse_id
       WHERE w.company_id = p_company_id AND s.quantity = 0) AS rows_with_zero_count;
END;
$$;

COMMIT;
