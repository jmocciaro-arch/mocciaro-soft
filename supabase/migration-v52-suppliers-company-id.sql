-- Migration v52 — tt_suppliers.company_id (aislamiento multi-empresa)
--
-- WHY: tt_suppliers no tenía company_id, los 88 proveedores eran globales
-- a las 4 empresas. Eso violaba la regla de oro multi-empresa: un usuario
-- viendo BS también veía proveedores de TT, TQ y GA.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → pegar este archivo y
-- ejecutar. Es idempotente: si la columna ya existe la deja como está.
--
-- BACKFILL: como históricamente todos los proveedores se cargaron desde
-- TT (TorqueTools SL), el backfill asigna a TT por defecto. Si querés
-- reasignar manualmente algunos a otra empresa, hacelo después con UPDATE.

BEGIN;

-- 1. Sumar columna company_id (nullable inicialmente para hacer el backfill)
ALTER TABLE tt_suppliers
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES tt_companies(id);

-- 2. Index para queries por company_id
CREATE INDEX IF NOT EXISTS idx_tt_suppliers_company_id ON tt_suppliers(company_id);

-- 3. Backfill: asignar todos los suppliers existentes a TorqueTools SL (TT).
-- Si en el futuro decidís que algún proveedor pertenece a otra empresa, hacé
-- UPDATE manual.
UPDATE tt_suppliers
SET company_id = (SELECT id FROM tt_companies WHERE code_prefix = 'TT' LIMIT 1)
WHERE company_id IS NULL;

-- 4. Verificación: contar cuántos quedaron sin company_id (debería ser 0).
DO $$
DECLARE
  v_null_count int;
  v_total_count int;
BEGIN
  SELECT count(*) INTO v_null_count FROM tt_suppliers WHERE company_id IS NULL;
  SELECT count(*) INTO v_total_count FROM tt_suppliers;
  RAISE NOTICE 'tt_suppliers backfill: % de % filas tienen company_id', v_total_count - v_null_count, v_total_count;
  IF v_null_count > 0 THEN
    RAISE WARNING 'Quedan % suppliers sin company_id. Revisá: SELECT * FROM tt_suppliers WHERE company_id IS NULL;', v_null_count;
  END IF;
END
$$;

-- 5. Comentario para documentar que la columna no es NOT NULL todavía
-- (se puede convertir en una próxima migración cuando se confirme el backfill).
COMMENT ON COLUMN tt_suppliers.company_id IS 'Empresa propietaria del proveedor. Backfill 2026-05-07: todos asignados a TT. Convertir a NOT NULL cuando se confirme.';

-- 6. Tablas relacionadas (tt_supplier_contacts) heredan filtro vía JOIN.
-- Si en el futuro se necesita aislar contactos por empresa también, sumar columna.

COMMIT;
