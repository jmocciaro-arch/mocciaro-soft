-- Migration v55 — RLS helper + endurecimiento piloto
--
-- WHY: Hoy las RLS de la mayoría de tablas son demasiado permisivas
-- (USING true). Eso significa que cualquier usuario autenticado puede
-- leer datos de todas las empresas si hace queries directas a Supabase
-- (no solo via la app). La regla de oro multi-empresa solo se enforce
-- en código de aplicación.
--
-- Esta migración trae 2 cosas:
--
-- 1. Helper function `app_user_company_ids()` — devuelve el set de
--    company_ids que el usuario actual (auth.uid()) puede ver, usando
--    tt_users.auth_id + tt_user_companies. SECURITY DEFINER para evitar
--    recursión RLS.
--
-- 2. Piloto: endurecer RLS de tt_stock_reservations (tabla nueva, poco
--    uso, rollback fácil). El acceso a una reserva queda atado a que
--    el usuario tenga acceso a la empresa del documento padre.
--
-- IMPORTANTE: service_role bypassea RLS automáticamente, así que las
-- queries del backend (con SUPABASE_SERVICE_ROLE_KEY) siguen funcionando.
-- Solo afecta a queries hechas con el token JWT de un usuario autenticado.
--
-- HOW TO APPLY: Supabase SQL Editor. Idempotente.
--
-- ROLLBACK: si algo se rompe, ejecutar el bloque de ROLLBACK al final
-- (comentado, descomentar para usar).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Helper function
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app_user_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uc.company_id
  FROM tt_user_companies uc
  JOIN tt_users u ON u.id = uc.user_id
  WHERE u.auth_id = auth.uid()
$$;

COMMENT ON FUNCTION app_user_company_ids IS
  'Devuelve los company_ids accesibles para el usuario actual (auth.uid()). Usar en RLS policies como company_id IN (SELECT app_user_company_ids()).';

-- Helper booleano: ¿el user actual ve esta empresa?
CREATE OR REPLACE FUNCTION app_can_see_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tt_user_companies uc
    JOIN tt_users u ON u.id = uc.user_id
    WHERE u.auth_id = auth.uid()
      AND uc.company_id = p_company_id
  )
$$;

COMMENT ON FUNCTION app_can_see_company IS 'True si el usuario actual tiene acceso a la empresa indicada.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Piloto: endurecer tt_stock_reservations
-- ─────────────────────────────────────────────────────────────────────
-- Una reserva pertenece al documento padre. El acceso depende de la
-- empresa del documento.

DROP POLICY IF EXISTS "stock_reservations_authenticated_all" ON tt_stock_reservations;

-- Lectura: el user puede ver las reservas de docs de empresas a las que tiene acceso.
CREATE POLICY "stock_reservations_select_by_company"
  ON tt_stock_reservations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_stock_reservations.document_id
        AND app_can_see_company(d.company_id)
    )
  );

-- Inserción: idem.
CREATE POLICY "stock_reservations_insert_by_company"
  ON tt_stock_reservations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_stock_reservations.document_id
        AND app_can_see_company(d.company_id)
    )
  );

-- Update: idem.
CREATE POLICY "stock_reservations_update_by_company"
  ON tt_stock_reservations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_stock_reservations.document_id
        AND app_can_see_company(d.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_stock_reservations.document_id
        AND app_can_see_company(d.company_id)
    )
  );

-- Delete: idem.
CREATE POLICY "stock_reservations_delete_by_company"
  ON tt_stock_reservations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_stock_reservations.document_id
        AND app_can_see_company(d.company_id)
    )
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK (descomentar y ejecutar manualmente si hay problemas)
-- ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS "stock_reservations_select_by_company" ON tt_stock_reservations;
-- DROP POLICY IF EXISTS "stock_reservations_insert_by_company" ON tt_stock_reservations;
-- DROP POLICY IF EXISTS "stock_reservations_update_by_company" ON tt_stock_reservations;
-- DROP POLICY IF EXISTS "stock_reservations_delete_by_company" ON tt_stock_reservations;
-- CREATE POLICY "stock_reservations_authenticated_all"
--   ON tt_stock_reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- COMMIT;
