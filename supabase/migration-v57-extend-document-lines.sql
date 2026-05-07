-- ════════════════════════════════════════════════════════════════════════
-- Migration v57 — Extender tt_document_lines con campos operativos
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY: Fase 1.1 del PLAN-REFACTOR. La tabla `tt_document_lines` (modelo
-- unificado nuevo) NO tiene los campos operativos que sí tiene la legacy
-- `tt_document_items` (qty_reserved, qty_received, qty_cancelled,
-- requires_po, po_*, warehouse_id, oc_line_ref, internal_description,
-- cost_snapshot, unit_cost, sort_order, stock_at_creation).
--
-- Si migráramos datos sin antes extender el schema, perderíamos
-- información operativa crítica (drop-ship cross-purchase, snapshots de
-- costo, links a líneas de OC del cliente, almacén origen, etc.).
--
-- Esta migración SOLO EXTIENDE EL SCHEMA. NO copia datos. La copia
-- (de tt_document_items → tt_document_lines) va en una migración
-- separada (v58 — script de migración de datos con dry-run).
--
-- HOW TO APPLY:
--   1. Ejecutar primero en STAGING (Supabase branch DB).
--   2. Verificar que todos los tests E2E + RLS cross-company pasan.
--   3. Recién después aplicar en producción vía Supabase SQL Editor.
--   4. Idempotente — todos los ALTER usan IF NOT EXISTS / DROP IF EXISTS.
--
-- ROLLBACK: ver bloque al final del archivo.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. CAMPOS DE CANTIDAD OPERATIVA
-- ─────────────────────────────────────────────────────────────────────
-- Coherencia: usamos prefijo `quantity_*` para alinear con los ya
-- existentes (`quantity_delivered`, `quantity_invoiced`). NO usamos
-- el prefijo legacy `qty_*` para no perpetuar la dualidad.

ALTER TABLE tt_document_lines
  ADD COLUMN IF NOT EXISTS quantity_reserved   NUMERIC(20,4) NOT NULL DEFAULT 0
    CHECK (quantity_reserved >= 0),
  ADD COLUMN IF NOT EXISTS quantity_received   NUMERIC(20,4) NOT NULL DEFAULT 0
    CHECK (quantity_received >= 0),
  ADD COLUMN IF NOT EXISTS quantity_cancelled  NUMERIC(20,4) NOT NULL DEFAULT 0
    CHECK (quantity_cancelled >= 0);

COMMENT ON COLUMN tt_document_lines.quantity_reserved IS
  'Cantidad reservada en stock (para sales_order). Manejada por tt_stock_reservations.';
COMMENT ON COLUMN tt_document_lines.quantity_received IS
  'Cantidad recibida (para purchase_order). Para sales_order siempre 0.';
COMMENT ON COLUMN tt_document_lines.quantity_cancelled IS
  'Cantidad cancelada explícitamente (no se va a entregar/recibir).';

-- ─────────────────────────────────────────────────────────────────────
-- 2. COSTOS Y SNAPSHOT
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE tt_document_lines
  ADD COLUMN IF NOT EXISTS unit_cost      NUMERIC(20,4) NOT NULL DEFAULT 0
    CHECK (unit_cost >= 0),
  ADD COLUMN IF NOT EXISTS cost_snapshot  NUMERIC(20,4)
    CHECK (cost_snapshot IS NULL OR cost_snapshot >= 0);

COMMENT ON COLUMN tt_document_lines.unit_cost IS
  'Costo unitario actual del producto al momento de creación de la línea.';
COMMENT ON COLUMN tt_document_lines.cost_snapshot IS
  'Snapshot histórico del costo. Permite calcular margen real aunque después cambie el costo del producto. Null = no se tomó snapshot.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. DROP-SHIPPING / CROSS-PURCHASE
-- ─────────────────────────────────────────────────────────────────────
-- Items de un sales_order pueden disparar automáticamente la creación
-- de un purchase_order al proveedor (cuando no hay stock y el item
-- requiere compra). Estos campos llevan ese link.

ALTER TABLE tt_document_lines
  ADD COLUMN IF NOT EXISTS requires_po      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS po_status        TEXT
    CHECK (po_status IS NULL OR po_status IN ('pending', 'requested', 'confirmed', 'received', 'cancelled')),
  ADD COLUMN IF NOT EXISTS po_document_id   UUID REFERENCES tt_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN tt_document_lines.requires_po IS
  'true si esta línea requiere disparar una orden de compra al proveedor (drop-ship).';
COMMENT ON COLUMN tt_document_lines.po_status IS
  'Estado del PO derivado: pending | requested | confirmed | received | cancelled.';
COMMENT ON COLUMN tt_document_lines.po_document_id IS
  'FK al purchase_order generado a partir de esta línea (si requires_po=true).';

-- ─────────────────────────────────────────────────────────────────────
-- 4. ALMACÉN Y STOCK
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE tt_document_lines
  ADD COLUMN IF NOT EXISTS warehouse_id        UUID REFERENCES tt_warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_at_creation   NUMERIC(20,4)
    CHECK (stock_at_creation IS NULL OR stock_at_creation >= 0);

COMMENT ON COLUMN tt_document_lines.warehouse_id IS
  'Almacén origen (para sales_order/delivery_note) o destino (para purchase_order). Null = default de la empresa.';
COMMENT ON COLUMN tt_document_lines.stock_at_creation IS
  'Stock disponible al momento de crear la línea. Útil para análisis de "vendí lo que tenía" vs "vendí lo que no tenía". Null = no se tomó.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. REFERENCIAS A OC DEL CLIENTE
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE tt_document_lines
  ADD COLUMN IF NOT EXISTS oc_line_ref           TEXT,
  ADD COLUMN IF NOT EXISTS internal_description  TEXT;

COMMENT ON COLUMN tt_document_lines.oc_line_ref IS
  'Referencia a la línea original de la OC del cliente (ej. "OC-57728/3"). Permite trazar que esta línea vino de la línea 3 de la OC 57728.';
COMMENT ON COLUMN tt_document_lines.internal_description IS
  'Descripción para uso interno (no aparece en PDFs al cliente). Para notas de operaciones, picking, etc.';

-- ─────────────────────────────────────────────────────────────────────
-- 6. ORDENAMIENTO ALTERNATIVO
-- ─────────────────────────────────────────────────────────────────────
-- `tt_document_lines` ya tiene `line_number` como UNIQUE por documento.
-- Mantenemos `sort_order` separado para permitir reordenar visualmente
-- sin re-numerar líneas (que rompería trazabilidad de source_line_id).

ALTER TABLE tt_document_lines
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN tt_document_lines.sort_order IS
  'Orden visual de la línea en el documento. line_number es la identidad estable (no cambia tras crear); sort_order puede reordenarse libremente.';

-- ─────────────────────────────────────────────────────────────────────
-- 7. ÍNDICES PARA QUERIES OPERATIVAS
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tt_document_lines_warehouse
  ON tt_document_lines(warehouse_id)
  WHERE warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tt_document_lines_po_doc
  ON tt_document_lines(po_document_id)
  WHERE po_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tt_document_lines_requires_po
  ON tt_document_lines(document_id, requires_po)
  WHERE requires_po = true;

-- ─────────────────────────────────────────────────────────────────────
-- 8. ACTUALIZAR TRIGGER DE PROTECCIÓN (fn_protect_lines_on_locked_doc)
-- ─────────────────────────────────────────────────────────────────────
-- El trigger v38 lista los campos comerciales que NO se pueden
-- modificar tras emisión. Los campos operativos nuevos (cantidades
-- de derivación, status de PO, etc.) deben ser actualizables después
-- de emisión, igual que quantity_delivered / quantity_invoiced.
--
-- Estos NUEVOS campos también son OPERATIVOS (no comerciales) y por
-- lo tanto NO se chequean acá:
--   - quantity_reserved, quantity_received, quantity_cancelled
--   - po_status, po_document_id
--   - stock_at_creation (snapshot histórico, no debería cambiar)
--
-- Estos NUEVOS campos SÍ son comerciales (y se chequean):
--   - unit_cost, cost_snapshot — cambia el margen
--   - requires_po — cambia la lógica de derivación
--   - warehouse_id — cambia origen de stock
--   - oc_line_ref — referencia inmutable a OC origen
--   - internal_description, sort_order — visuales pero deberían estar
--     fijos tras emisión (sort_order discutible, lo dejamos protegido).

CREATE OR REPLACE FUNCTION fn_protect_lines_on_locked_doc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_locked boolean;
  v_doc_id uuid := COALESCE(new.document_id, old.document_id);
BEGIN
  SELECT status, locked INTO v_status, v_locked
  FROM tt_documents WHERE id = v_doc_id;

  IF v_status = 'draft' AND v_locked = false THEN
    RETURN COALESCE(new, old);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'No se pueden agregar líneas a documento % (status=%, locked=%)',
      v_doc_id, v_status, v_locked USING errcode = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se pueden eliminar líneas de documento % (status=%, locked=%)',
      v_doc_id, v_status, v_locked USING errcode = 'check_violation';
  END IF;

  -- UPDATE: campos comerciales bloqueados.
  -- Permitidos (no se chequean):
  --   quantity_delivered, quantity_invoiced, quantity_reserved,
  --   quantity_received, quantity_cancelled, po_status, po_document_id,
  --   stock_at_creation
  IF (new.quantity             IS DISTINCT FROM old.quantity)
  OR (new.unit_price           IS DISTINCT FROM old.unit_price)
  OR (new.unit_cost            IS DISTINCT FROM old.unit_cost)
  OR (new.cost_snapshot        IS DISTINCT FROM old.cost_snapshot)
  OR (new.discount_pct         IS DISTINCT FROM old.discount_pct)
  OR (new.discount_amount      IS DISTINCT FROM old.discount_amount)
  OR (new.tax_rate             IS DISTINCT FROM old.tax_rate)
  OR (new.tax_amount           IS DISTINCT FROM old.tax_amount)
  OR (new.subtotal             IS DISTINCT FROM old.subtotal)
  OR (new.total                IS DISTINCT FROM old.total)
  OR (new.product_name         IS DISTINCT FROM old.product_name)
  OR (new.product_sku          IS DISTINCT FROM old.product_sku)
  OR (new.product_id           IS DISTINCT FROM old.product_id)
  OR (new.description          IS DISTINCT FROM old.description)
  OR (new.unit                 IS DISTINCT FROM old.unit)
  OR (new.line_number          IS DISTINCT FROM old.line_number)
  OR (new.attributes::text     IS DISTINCT FROM old.attributes::text)
  OR (new.image_url            IS DISTINCT FROM old.image_url)
  OR (new.notes                IS DISTINCT FROM old.notes)
  OR (new.source_line_id       IS DISTINCT FROM old.source_line_id)
  OR (new.requires_po          IS DISTINCT FROM old.requires_po)
  OR (new.warehouse_id         IS DISTINCT FROM old.warehouse_id)
  OR (new.oc_line_ref          IS DISTINCT FROM old.oc_line_ref)
  OR (new.internal_description IS DISTINCT FROM old.internal_description)
  OR (new.sort_order           IS DISTINCT FROM old.sort_order)
  THEN
    RAISE EXCEPTION 'No se pueden modificar campos comerciales en líneas de documento % (status=%, locked=%)',
      v_doc_id, v_status, v_locked USING errcode = 'check_violation';
  END IF;

  RETURN new;
END;
$$;

-- El trigger ya existe (v38). Solo redefinimos la función. No hace
-- falta DROP/CREATE TRIGGER porque el trigger apunta a la función
-- por nombre y CREATE OR REPLACE FUNCTION conserva la binding.

-- ─────────────────────────────────────────────────────────────────────
-- 9. VALIDACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────
-- Confirmar que todas las columnas existen y los defaults son 0/false.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(col, ', ') INTO v_missing
  FROM (VALUES
    ('quantity_reserved'),
    ('quantity_received'),
    ('quantity_cancelled'),
    ('unit_cost'),
    ('cost_snapshot'),
    ('requires_po'),
    ('po_status'),
    ('po_document_id'),
    ('warehouse_id'),
    ('stock_at_creation'),
    ('oc_line_ref'),
    ('internal_description'),
    ('sort_order')
  ) AS expected(col)
  WHERE col NOT IN (
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tt_document_lines'
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'v57 incompleta — faltan columnas: %', v_missing;
  END IF;

  RAISE NOTICE 'v57 OK — tt_document_lines extendida con 13 columnas operativas.';
END;
$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (NO ejecutar salvo emergencia)
-- ════════════════════════════════════════════════════════════════════════
-- Antes de hacer rollback, verificar que NINGÚN endpoint nuevo está
-- escribiendo en estas columnas. Si hay datos, se pierden.
--
-- BEGIN;
--
-- -- 1. Restaurar trigger v38 (versión sin los nuevos campos)
-- CREATE OR REPLACE FUNCTION fn_protect_lines_on_locked_doc()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- AS $rb$
-- DECLARE v_status text; v_locked boolean;
--   v_doc_id uuid := COALESCE(new.document_id, old.document_id);
-- BEGIN
--   SELECT status, locked INTO v_status, v_locked FROM tt_documents WHERE id = v_doc_id;
--   IF v_status = 'draft' AND v_locked = false THEN RETURN COALESCE(new, old); END IF;
--   IF TG_OP = 'INSERT' THEN RAISE EXCEPTION '...' USING errcode = 'check_violation'; END IF;
--   IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '...' USING errcode = 'check_violation'; END IF;
--   IF (new.quantity IS DISTINCT FROM old.quantity)
--   OR (new.unit_price IS DISTINCT FROM old.unit_price)
--   OR (new.discount_pct IS DISTINCT FROM old.discount_pct)
--   OR (new.discount_amount IS DISTINCT FROM old.discount_amount)
--   OR (new.tax_rate IS DISTINCT FROM old.tax_rate)
--   OR (new.tax_amount IS DISTINCT FROM old.tax_amount)
--   OR (new.subtotal IS DISTINCT FROM old.subtotal)
--   OR (new.total IS DISTINCT FROM old.total)
--   OR (new.product_name IS DISTINCT FROM old.product_name)
--   OR (new.product_sku IS DISTINCT FROM old.product_sku)
--   OR (new.product_id IS DISTINCT FROM old.product_id)
--   OR (new.description IS DISTINCT FROM old.description)
--   OR (new.unit IS DISTINCT FROM old.unit)
--   OR (new.line_number IS DISTINCT FROM old.line_number)
--   OR (new.attributes::text IS DISTINCT FROM old.attributes::text)
--   OR (new.image_url IS DISTINCT FROM old.image_url)
--   OR (new.notes IS DISTINCT FROM old.notes)
--   OR (new.source_line_id IS DISTINCT FROM old.source_line_id)
--   THEN RAISE EXCEPTION '...' USING errcode = 'check_violation';
--   END IF;
--   RETURN new;
-- END; $rb$;
--
-- -- 2. Drop indices
-- DROP INDEX IF EXISTS idx_tt_document_lines_warehouse;
-- DROP INDEX IF EXISTS idx_tt_document_lines_po_doc;
-- DROP INDEX IF EXISTS idx_tt_document_lines_requires_po;
--
-- -- 3. Drop columnas (PIERDE DATOS si hay)
-- ALTER TABLE tt_document_lines
--   DROP COLUMN IF EXISTS quantity_reserved,
--   DROP COLUMN IF EXISTS quantity_received,
--   DROP COLUMN IF EXISTS quantity_cancelled,
--   DROP COLUMN IF EXISTS unit_cost,
--   DROP COLUMN IF EXISTS cost_snapshot,
--   DROP COLUMN IF EXISTS requires_po,
--   DROP COLUMN IF EXISTS po_status,
--   DROP COLUMN IF EXISTS po_document_id,
--   DROP COLUMN IF EXISTS warehouse_id,
--   DROP COLUMN IF EXISTS stock_at_creation,
--   DROP COLUMN IF EXISTS oc_line_ref,
--   DROP COLUMN IF EXISTS internal_description,
--   DROP COLUMN IF EXISTS sort_order;
--
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════
