-- ============================================================================
-- v91 — RLS policies para tt_documents (HOTFIX retroactivo)
-- ============================================================================
--
-- CONTEXTO:
--   Estas policies fueron aplicadas a mano en hot-fix durante validación de F1
--   (Next-Step Suggester) porque tt_documents tenía RLS habilitada SIN policies
--   (= deny all para authenticated). El endpoint GET /api/next-steps no podía
--   leer la cotización fixture.
--
--   Se versionan acá para que:
--     1) Al levantar staging/clone desde scratch, las policies existan.
--     2) Cuando se aplique v86 oficial (RLS críticas con smoke multi-user),
--        haya un punto de referencia explícito y se revise overlap.
--
-- CARACTERÍSTICAS:
--   • SELECT/INSERT/UPDATE: filtran por company_id IN (companies del user vía
--     tt_user_companies, joineando tt_users.auth_id = auth.uid()).
--   • service_role: bypass total (FOR ALL USING true).
--   • DELETE: NO se agrega policy (deny implícito). Si se necesita borrar
--     documentos, va por endpoint con service_role o admin gate.
--
-- DEUDA / NEXT STEPS:
--   • Smoke test multi-user pendiente (2 users de empresas distintas,
--     verificar aislamiento). Cuando se haga v86 oficial.
--   • Revisar si las policies de v86 (cuando se apliquen) hacen overlap o
--     conflict con estas. Si v86 las redefine con misma firma, drop&replace
--     es seguro. Si v86 cambia roles o expression, evaluar.
--   • La función auth.uid() podría envolverse en (SELECT ...) para initplan
--     optimization (igual que v88). Acá ya está envuelta ✅.
--
-- AUDITORÍA / TRAZA:
--   • Aplicadas vía MCP el 2026-05-24 durante hotfix de F1.
--   • Migration file creada después del hecho para versionado.
-- ============================================================================

-- ── SELECT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tt_documents_select_own_company ON tt_documents;
CREATE POLICY tt_documents_select_own_company
  ON tt_documents FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT uc.company_id
        FROM tt_user_companies uc
        JOIN tt_users u ON u.id = uc.user_id
       WHERE u.auth_id = (SELECT auth.uid())
    )
  );

-- ── INSERT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tt_documents_insert_own_company ON tt_documents;
CREATE POLICY tt_documents_insert_own_company
  ON tt_documents FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT uc.company_id
        FROM tt_user_companies uc
        JOIN tt_users u ON u.id = uc.user_id
       WHERE u.auth_id = (SELECT auth.uid())
    )
  );

-- ── UPDATE ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tt_documents_update_own_company ON tt_documents;
CREATE POLICY tt_documents_update_own_company
  ON tt_documents FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT uc.company_id
        FROM tt_user_companies uc
        JOIN tt_users u ON u.id = uc.user_id
       WHERE u.auth_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT uc.company_id
        FROM tt_user_companies uc
        JOIN tt_users u ON u.id = uc.user_id
       WHERE u.auth_id = (SELECT auth.uid())
    )
  );

-- ── service_role bypass ────────────────────────────────────────────────────
DROP POLICY IF EXISTS tt_documents_service_role_all ON tt_documents;
CREATE POLICY tt_documents_service_role_all
  ON tt_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- VERIFICACIÓN POST-APPLY:
--   SELECT polname, polcmd FROM pg_policy
--    WHERE polrelid = 'tt_documents'::regclass;
--   -- Esperado: 4 filas (select/insert/update/all-service-role)
-- ============================================================================
