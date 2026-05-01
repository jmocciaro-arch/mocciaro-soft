-- ================================================================
-- MIGRATION V43 — SISTEMA DE PAÑOL (Fase 1)
-- Event sourcing: stock calculado desde movimientos inmutables
-- Entidades: ubicaciones, unidades (por serie), movimientos, stock cache
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) UBICACIONES
-- Tipo: 'warehouse' (depósito físico), 'person' (persona),
--       'vehicle' (vehículo), 'workshop' (taller), 'supplier' (proveedor para en-tránsito)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_inv_locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL,              -- ej: 'DEP-AR-01', 'JUAN-MOCCIARO', 'TALLER-BA'
  name         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('warehouse','person','vehicle','workshop','supplier','customer')),
  company_id   uuid REFERENCES tt_companies(id) ON DELETE SET NULL,  -- a qué empresa pertenece
  user_id      uuid REFERENCES tt_users(id) ON DELETE SET NULL,      -- si type='person'
  parent_id    uuid REFERENCES tt_inv_locations(id) ON DELETE SET NULL, -- ej: taller dentro de depósito
  address      text,
  active       boolean NOT NULL DEFAULT true,
  is_default   boolean NOT NULL DEFAULT false,    -- ubicación default de la empresa
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_locations_company ON tt_inv_locations(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_locations_type    ON tt_inv_locations(type);
CREATE INDEX IF NOT EXISTS idx_inv_locations_user    ON tt_inv_locations(user_id);

-- ----------------------------------------------------------------
-- 2) UNIDADES INDIVIDUALES (con número de serie)
-- Solo se crean para items con tracked_by_serial=true
-- Cada unidad es una "herramienta física" con historial propio
-- ----------------------------------------------------------------
ALTER TABLE tt_products
  ADD COLUMN IF NOT EXISTS tracked_by_serial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_calibrable     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calibration_cycle_days int;  -- ej: 365 para torquímetros

CREATE TABLE IF NOT EXISTS tt_inv_units (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES tt_products(id) ON DELETE RESTRICT,
  serial_number  text NOT NULL,
  -- Estado actual (cache de movimientos)
  current_location_id uuid REFERENCES tt_inv_locations(id) ON DELETE SET NULL,
  state          text NOT NULL DEFAULT 'available'
                 CHECK (state IN ('available','in_use','in_transit','in_repair','in_calibration','lost','discarded')),
  -- Datos adicionales
  purchase_date  date,
  purchase_cost  numeric(14,2),
  purchase_currency text,
  warranty_until date,
  -- Calibración
  last_calibration_date date,
  next_calibration_date date,                         -- calculado: last + cycle_days
  calibration_certificate_url text,
  notes          text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_units_product  ON tt_inv_units(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_units_location ON tt_inv_units(current_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_units_state    ON tt_inv_units(state);
CREATE INDEX IF NOT EXISTS idx_inv_units_next_cal ON tt_inv_units(next_calibration_date) WHERE next_calibration_date IS NOT NULL;

-- ----------------------------------------------------------------
-- 3) MOVIMIENTOS (core del sistema — inmutables, append-only)
-- Cada fila describe UN movimiento de stock
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_inv_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ¿Qué se movió?
  product_id      uuid NOT NULL REFERENCES tt_products(id) ON DELETE RESTRICT,
  unit_id         uuid REFERENCES tt_inv_units(id) ON DELETE RESTRICT,  -- null si es por cantidad
  quantity        numeric(12,3) NOT NULL CHECK (quantity <> 0),         -- positivo o negativo según tipo
  -- Tipo de movimiento
  movement_type   text NOT NULL
                  CHECK (movement_type IN (
                    'entry',        -- entrada (compra, recepción)
                    'exit',         -- salida (venta, consumo)
                    'transfer',     -- transferencia entre ubicaciones
                    'return',       -- devolución
                    'adjustment',   -- ajuste (diferencia de inventario)
                    'disposal',     -- baja (rotura, pérdida)
                    'repair_out',   -- enviado a reparación
                    'repair_in',    -- vuelto de reparación
                    'calibration_out', -- enviado a calibrar
                    'calibration_in',  -- vuelto de calibración
                    'reservation_hold',   -- reserva (no mueve físico, bloquea disponible)
                    'reservation_release' -- libera reserva
                  )),
  -- De dónde / a dónde
  from_location_id uuid REFERENCES tt_inv_locations(id) ON DELETE SET NULL,
  to_location_id   uuid REFERENCES tt_inv_locations(id) ON DELETE SET NULL,
  -- Estado resultante de la unidad (si aplica)
  resulting_state  text,
  -- Metadata
  reason           text,                    -- motivo obligatorio para ciertos tipos
  reference_type   text,                    -- 'sat', 'purchase_order', 'sale', 'manual'
  reference_id     uuid,                    -- fk al documento que originó el movimiento
  -- Quién
  performed_by_user_id uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  approved_by_user_id  uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  -- Timestamps
  performed_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- IA
  ia_prompt       text,
  ia_confidence   numeric(3,2),
  ia_auto_approved boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_product    ON tt_inv_movements(product_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_unit       ON tt_inv_movements(unit_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_from       ON tt_inv_movements(from_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_to         ON tt_inv_movements(to_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_type       ON tt_inv_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inv_mov_ref        ON tt_inv_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_user       ON tt_inv_movements(performed_by_user_id, performed_at DESC);

-- Evitar doble movimiento de misma unidad al mismo tiempo (idempotencia)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_mov_unit_ts
  ON tt_inv_movements(unit_id, performed_at)
  WHERE unit_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 4) STOCK CACHE (se actualiza por trigger desde movimientos)
-- Una fila por (product_id, location_id). Stock por cantidad.
-- Para items con serie, cada fila representa "unidades no salidas".
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_inv_stock (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  location_id       uuid NOT NULL REFERENCES tt_inv_locations(id) ON DELETE CASCADE,
  quantity_on_hand  numeric(12,3) NOT NULL DEFAULT 0,    -- físico actual
  quantity_reserved numeric(12,3) NOT NULL DEFAULT 0,    -- reservado por OTs
  quantity_in_transit numeric(12,3) NOT NULL DEFAULT 0,  -- OCs no recibidas
  last_movement_at  timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_location ON tt_inv_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_available ON tt_inv_stock(product_id, location_id)
  WHERE quantity_on_hand > 0;

-- Vista útil: stock disponible = físico - reservado
CREATE OR REPLACE VIEW tt_inv_stock_available AS
SELECT
  s.product_id, s.location_id,
  s.quantity_on_hand,
  s.quantity_reserved,
  s.quantity_in_transit,
  (s.quantity_on_hand - s.quantity_reserved) AS quantity_available,
  (s.quantity_on_hand - s.quantity_reserved + s.quantity_in_transit) AS quantity_available_with_transit,
  s.last_movement_at
FROM tt_inv_stock s;

-- ----------------------------------------------------------------
-- 5) FUNCIÓN: recalcular stock para un (product, location) desde movimientos
-- Útil para auditoría y para inicializar stock
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_inv_stock(p_product uuid, p_location uuid)
RETURNS numeric LANGUAGE plpgsql AS $FN$
DECLARE
  v_qty numeric(12,3) := 0;
BEGIN
  -- Suma de movimientos que salen y entran a esta ubicación
  SELECT COALESCE(SUM(
    CASE
      WHEN m.movement_type IN ('reservation_hold','reservation_release') THEN 0
      WHEN m.to_location_id   = p_location THEN  m.quantity
      WHEN m.from_location_id = p_location THEN -m.quantity
      ELSE 0
    END
  ), 0) INTO v_qty
  FROM tt_inv_movements m
  WHERE m.product_id = p_product
    AND (m.from_location_id = p_location OR m.to_location_id = p_location);

  -- Upsert en cache
  INSERT INTO tt_inv_stock (product_id, location_id, quantity_on_hand, last_movement_at, updated_at)
  VALUES (p_product, p_location, v_qty, now(), now())
  ON CONFLICT (product_id, location_id) DO UPDATE SET
    quantity_on_hand  = EXCLUDED.quantity_on_hand,
    last_movement_at  = EXCLUDED.last_movement_at,
    updated_at        = now();

  RETURN v_qty;
END
$FN$;

-- ----------------------------------------------------------------
-- 6) TRIGGER: actualiza stock cache + estado de unidad en cada movimiento
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_inv_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $TR$
BEGIN
  -- 1) Actualizar stock cache para origen y destino
  IF NEW.from_location_id IS NOT NULL THEN
    PERFORM recompute_inv_stock(NEW.product_id, NEW.from_location_id);
  END IF;
  IF NEW.to_location_id IS NOT NULL AND NEW.to_location_id <> COALESCE(NEW.from_location_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM recompute_inv_stock(NEW.product_id, NEW.to_location_id);
  END IF;

  -- 2) Si es una unidad trackeada, actualizar su ubicación y estado
  IF NEW.unit_id IS NOT NULL THEN
    UPDATE tt_inv_units
    SET
      current_location_id = COALESCE(NEW.to_location_id, current_location_id),
      state = COALESCE(NEW.resulting_state, state),
      updated_at = now()
    WHERE id = NEW.unit_id;
  END IF;

  RETURN NEW;
END
$TR$;

DROP TRIGGER IF EXISTS trg_apply_inv_movement ON tt_inv_movements;
CREATE TRIGGER trg_apply_inv_movement
  AFTER INSERT ON tt_inv_movements
  FOR EACH ROW EXECUTE FUNCTION apply_inv_movement();

-- ----------------------------------------------------------------
-- 7) REGLAS DE VALIDACIÓN (no stock negativo, etc)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_inv_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $V$
DECLARE
  v_stock_origen numeric;
BEGIN
  -- Para movimientos de salida o transferencia, validar que hay stock
  IF NEW.movement_type IN ('exit','transfer','repair_out','calibration_out','disposal','reservation_hold')
     AND NEW.from_location_id IS NOT NULL THEN
    SELECT quantity_on_hand INTO v_stock_origen
    FROM tt_inv_stock
    WHERE product_id = NEW.product_id AND location_id = NEW.from_location_id;

    IF COALESCE(v_stock_origen, 0) < NEW.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente en ubicación % para el producto % (disponible: %, solicitado: %)',
        NEW.from_location_id, NEW.product_id, COALESCE(v_stock_origen, 0), NEW.quantity;
    END IF;
  END IF;

  -- Motivo obligatorio en ciertos tipos
  IF NEW.movement_type IN ('adjustment','disposal','return') AND (NEW.reason IS NULL OR trim(NEW.reason) = '') THEN
    RAISE EXCEPTION 'Motivo obligatorio para movimientos de tipo %', NEW.movement_type;
  END IF;

  -- No permitir cantidad negativa
  IF NEW.quantity < 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser positiva (se usa movement_type para determinar signo)';
  END IF;

  RETURN NEW;
END
$V$;

DROP TRIGGER IF EXISTS trg_validate_inv_movement ON tt_inv_movements;
CREATE TRIGGER trg_validate_inv_movement
  BEFORE INSERT ON tt_inv_movements
  FOR EACH ROW EXECUTE FUNCTION validate_inv_movement();

-- ----------------------------------------------------------------
-- 8) RLS
-- ----------------------------------------------------------------
ALTER TABLE tt_inv_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_inv_units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_inv_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_inv_stock      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "inv_locations_read" ON tt_inv_locations FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_locations_all"  ON tt_inv_locations FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_locations_write_auth" ON tt_inv_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "inv_units_read" ON tt_inv_units FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_units_all"  ON tt_inv_units FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_units_write_auth" ON tt_inv_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "inv_mov_read" ON tt_inv_movements FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_mov_insert_auth" ON tt_inv_movements FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_mov_all"  ON tt_inv_movements FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "inv_stock_read" ON tt_inv_stock FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv_stock_all"  ON tt_inv_stock FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------
-- 9) DATA: ubicaciones iniciales para las 3 empresas
-- ----------------------------------------------------------------
INSERT INTO tt_inv_locations (code, name, type, company_id, is_default)
SELECT 'DEP-' || upper(substring(replace(c.name, ' ', '-'), 1, 10)), c.name || ' — Depósito Principal', 'warehouse', c.id, true
FROM tt_companies c
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
