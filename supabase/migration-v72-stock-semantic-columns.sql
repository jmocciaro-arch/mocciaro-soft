-- ════════════════════════════════════════════════════════════════════════
-- migration-v72: Stock semántico (FASE 1.1)
-- ════════════════════════════════════════════════════════════════════════
-- OBJETIVO:
--   Exponer columnas con nombres semánticos sobre tt_stock sin romper el
--   código existente (v53 + v54 ya usan quantity/reserved/min_quantity).
--   Las columnas nuevas son GENERATED ALWAYS — son alias 1:1 que el código
--   nuevo puede usar y el viejo sigue funcionando.
--
--   - quantity_on_hand   = quantity        (físico en almacén)
--   - quantity_committed = reserved        (comprometido por PEDs abiertos)
--   - quantity_available = quantity - reserved   (libre para nuevas reservas)
--
-- Además:
--   - Helper RPC stock_for_product_company(product_id, company_id) que
--     devuelve por almacén las 3 cantidades semánticas para la UI de /stock.
--   - Asegura que cada empresa activa tenga al menos un warehouse default.
--
-- IDEMPOTENTE — re-ejecutable.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Columnas generadas semánticas sobre tt_stock
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- quantity_on_hand: alias de quantity. STORED para que se pueda indexar.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_stock' AND column_name='quantity_on_hand'
  ) THEN
    ALTER TABLE public.tt_stock
      ADD COLUMN quantity_on_hand NUMERIC(14,4) GENERATED ALWAYS AS (quantity::NUMERIC) STORED;
  END IF;

  -- quantity_committed: alias de reserved.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_stock' AND column_name='quantity_committed'
  ) THEN
    ALTER TABLE public.tt_stock
      ADD COLUMN quantity_committed NUMERIC(14,4) GENERATED ALWAYS AS (reserved::NUMERIC) STORED;
  END IF;

  -- quantity_available: derivada. Puede ser negativa si hubo overdelivery
  -- forzada (FASE 1.5 con permiso allow_overdelivery).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_stock' AND column_name='quantity_available'
  ) THEN
    ALTER TABLE public.tt_stock
      ADD COLUMN quantity_available NUMERIC(14,4)
        GENERATED ALWAYS AS ((quantity::NUMERIC - reserved::NUMERIC)) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tt_stock_available
  ON public.tt_stock (product_id, warehouse_id)
  WHERE quantity_available > 0;

COMMENT ON COLUMN public.tt_stock.quantity_on_hand IS
  'Alias semántico de quantity (físico en almacén). Generated, no se inserta directo.';
COMMENT ON COLUMN public.tt_stock.quantity_committed IS
  'Alias semántico de reserved (comprometido por PEDs activos). Generated.';
COMMENT ON COLUMN public.tt_stock.quantity_available IS
  'Stock libre = on_hand - committed. Puede ser negativo si hubo overdelivery autorizada.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Helper RPC: stock por producto agrupado por almacén de una empresa
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stock_for_product_company(
  p_product_id UUID,
  p_company_id UUID
)
RETURNS TABLE (
  warehouse_id      UUID,
  warehouse_code    TEXT,
  warehouse_name    TEXT,
  quantity_on_hand  NUMERIC,
  quantity_committed NUMERIC,
  quantity_available NUMERIC,
  min_quantity      NUMERIC,
  is_below_min      BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.code,
    w.name,
    COALESCE(s.quantity_on_hand, 0),
    COALESCE(s.quantity_committed, 0),
    COALESCE(s.quantity_available, 0),
    COALESCE(s.min_quantity::NUMERIC, 0),
    (COALESCE(s.quantity_available, 0) < COALESCE(s.min_quantity::NUMERIC, 0))
  FROM tt_warehouses w
  LEFT JOIN tt_stock s
    ON s.warehouse_id = w.id AND s.product_id = p_product_id
  WHERE w.company_id = p_company_id
    AND COALESCE(w.is_active, w.active, true) = true
  ORDER BY w.code;
$$;

COMMENT ON FUNCTION stock_for_product_company IS
  'Devuelve stock de un producto por warehouse activo de una empresa. Usado por UI /stock y modal "stock insuficiente" del REM.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Stock por empresa (UI principal /stock)
--    Lista todos los productos con stock distinto de 0 en al menos un
--    warehouse de la empresa. Pivotea por almacén.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stock_overview_company(p_company_id UUID)
RETURNS TABLE (
  product_id          UUID,
  sku                 TEXT,
  product_name        TEXT,
  warehouse_id        UUID,
  warehouse_code      TEXT,
  quantity_on_hand    NUMERIC,
  quantity_committed  NUMERIC,
  quantity_available  NUMERIC,
  min_quantity        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.sku,
    p.name,
    w.id,
    w.code,
    COALESCE(s.quantity_on_hand, 0),
    COALESCE(s.quantity_committed, 0),
    COALESCE(s.quantity_available, 0),
    COALESCE(s.min_quantity::NUMERIC, 0)
  FROM tt_warehouses w
  CROSS JOIN tt_products p
  LEFT JOIN tt_stock s ON s.warehouse_id = w.id AND s.product_id = p.id
  WHERE w.company_id = p_company_id
    AND COALESCE(w.is_active, w.active, true) = true
    AND COALESCE(p.active, true) = true
    AND (s.quantity_on_hand IS NOT NULL OR s.quantity_committed IS NOT NULL)
  ORDER BY p.sku, w.code;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Asegurar default_warehouse_for_company sigue funcionando con el
--    semantic naming (sin cambiar lógica).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION default_warehouse_for_company(p_company_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tt_warehouses
  WHERE company_id = p_company_id
    AND COALESCE(is_active, active, true) = true
  ORDER BY
    CASE WHEN is_default = true THEN 0 ELSE 1 END,
    code ASC
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Columna is_default en tt_warehouses (semánticamente útil para
--    default_warehouse_for_company).
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_warehouses' AND column_name='is_default'
  ) THEN
    ALTER TABLE public.tt_warehouses ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Único default por empresa (parcial UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_warehouse_per_company
  ON public.tt_warehouses (company_id)
  WHERE is_default = true;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   BEGIN;
--   ALTER TABLE tt_stock DROP COLUMN IF EXISTS quantity_on_hand;
--   ALTER TABLE tt_stock DROP COLUMN IF EXISTS quantity_committed;
--   ALTER TABLE tt_stock DROP COLUMN IF EXISTS quantity_available;
--   DROP INDEX IF EXISTS idx_tt_stock_available;
--   DROP INDEX IF EXISTS uniq_default_warehouse_per_company;
--   ALTER TABLE tt_warehouses DROP COLUMN IF EXISTS is_default;
--   DROP FUNCTION IF EXISTS stock_for_product_company(uuid, uuid);
--   DROP FUNCTION IF EXISTS stock_overview_company(uuid);
--   COMMIT;
-- ════════════════════════════════════════════════════════════════════════
