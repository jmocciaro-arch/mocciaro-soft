-- ============================================================================
-- v88: Optimizar 20 policies RLS con auth_rls_initplan (PERFORMANCE)
-- ============================================================================
-- Fuente: Supabase advisor (performance) — lint auth_rls_initplan.
--
-- Problema: las policies usan auth.uid() / auth.role() directamente, lo que
-- causa que Postgres re-evalúe la función por CADA fila. Solución: envolver
-- en (SELECT auth.uid()) para que el planner lo trate como un initplan
-- (evaluado UNA sola vez por query).
--
-- Doc: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- ESTRATEGIA: DROP + CREATE preservando la lógica EXACTA de la policy original.
-- Las 20 policies se obtuvieron via pg_policies, no inferidas.
--
-- SEGURO de aplicar: la semántica no cambia, solo cambia el plan de ejecución.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) tt_user_companies — "Users can view own company access" (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own company access" ON public.tt_user_companies;
CREATE POLICY "Users can view own company access"
  ON public.tt_user_companies FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT tt_users.id FROM public.tt_users
      WHERE tt_users.auth_id = (SELECT auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 2) tt_fein_models — "fein_models_select_authenticated" (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS fein_models_select_authenticated ON public.tt_fein_models;
CREATE POLICY fein_models_select_authenticated
  ON public.tt_fein_models FOR SELECT TO public
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 3) buscador_clientes — "buscador: user reads own" (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "buscador: user reads own" ON public.buscador_clientes;
CREATE POLICY "buscador: user reads own"
  ON public.buscador_clientes FOR SELECT TO public
  USING ((SELECT auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 4) buscador_clientes — "buscador: user inserts own" (INSERT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "buscador: user inserts own" ON public.buscador_clientes;
CREATE POLICY "buscador: user inserts own"
  ON public.buscador_clientes FOR INSERT TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5) tt_scheduled_exports — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_scheduled_exports;
CREATE POLICY auth_all
  ON public.tt_scheduled_exports FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 6) tt_import_jobs — "import_jobs_select" (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS import_jobs_select ON public.tt_import_jobs;
CREATE POLICY import_jobs_select
  ON public.tt_import_jobs FOR SELECT TO public
  USING (
    (user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tt_user_companies uc
      WHERE uc.user_id = (SELECT auth.uid())
        AND uc.company_id = tt_import_jobs.company_id
    )
  );

-- ----------------------------------------------------------------------------
-- 7) tt_import_jobs — "import_jobs_insert" (INSERT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS import_jobs_insert ON public.tt_import_jobs;
CREATE POLICY import_jobs_insert
  ON public.tt_import_jobs FOR INSERT TO public
  WITH CHECK (
    (user_id = (SELECT auth.uid())) OR (user_id IS NULL)
  );

-- ----------------------------------------------------------------------------
-- 8) tt_import_jobs — "import_jobs_update" (UPDATE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS import_jobs_update ON public.tt_import_jobs;
CREATE POLICY import_jobs_update
  ON public.tt_import_jobs FOR UPDATE TO public
  USING (
    (user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tt_user_companies uc
      WHERE uc.user_id = (SELECT auth.uid())
        AND uc.company_id = tt_import_jobs.company_id
    )
  );

-- ----------------------------------------------------------------------------
-- 9) tt_product_variants — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_product_variants;
CREATE POLICY auth_all
  ON public.tt_product_variants FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 10) tt_product_variant_attributes — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_product_variant_attributes;
CREATE POLICY auth_all
  ON public.tt_product_variant_attributes FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 11) tt_product_lots — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_product_lots;
CREATE POLICY auth_all
  ON public.tt_product_lots FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 12) tt_product_serials — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_product_serials;
CREATE POLICY auth_all
  ON public.tt_product_serials FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 13) tt_product_translations — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_product_translations;
CREATE POLICY auth_all
  ON public.tt_product_translations FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 14) tt_catalog_feeds — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_catalog_feeds;
CREATE POLICY auth_all
  ON public.tt_catalog_feeds FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 15) tt_catalog_rules — "auth_all" (ALL)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_all ON public.tt_catalog_rules;
CREATE POLICY auth_all
  ON public.tt_catalog_rules FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 16) tt_import_templates — "templates_select" (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS templates_select ON public.tt_import_templates;
CREATE POLICY templates_select
  ON public.tt_import_templates FOR SELECT TO public
  USING (
    (user_id = (SELECT auth.uid()))
    OR (
      (is_shared = true)
      AND EXISTS (
        SELECT 1 FROM public.tt_user_companies uc
        WHERE uc.user_id = (SELECT auth.uid())
          AND uc.company_id = tt_import_templates.company_id
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 17) tt_import_templates — "templates_insert" (INSERT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS templates_insert ON public.tt_import_templates;
CREATE POLICY templates_insert
  ON public.tt_import_templates FOR INSERT TO public
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 18) tt_import_templates — "templates_update" (UPDATE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS templates_update ON public.tt_import_templates;
CREATE POLICY templates_update
  ON public.tt_import_templates FOR UPDATE TO public
  USING (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 19) tt_import_templates — "templates_delete" (DELETE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS templates_delete ON public.tt_import_templates;
CREATE POLICY templates_delete
  ON public.tt_import_templates FOR DELETE TO public
  USING (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 20) tt_cron_runs — "cron_runs_admin_read" (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS cron_runs_admin_read ON public.tt_cron_runs;
CREATE POLICY cron_runs_admin_read
  ON public.tt_cron_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tt_users u
      WHERE u.auth_id = (SELECT auth.uid())
        AND u.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'superadmin'::text])
        AND u.active IS NOT FALSE
    )
  );

-- ============================================================================
-- INSTRUCCIONES DE APLICACIÓN
-- ============================================================================
-- 1) APLICAR (semi-seguro, semántica idéntica a las policies originales):
--      psql "$DATABASE_URL" -f supabase/migrations/v88_fix_rls_initplan.sql
--    O via Supabase SQL Editor.
--
--    Es seguro envolver todo en una transacción si querés:
--      BEGIN;
--      \i v88_fix_rls_initplan.sql
--      -- smoke test rápido
--      COMMIT;  -- o ROLLBACK si algo falla
--
-- 2) VERIFICAR post-apply: re-correr advisor performance:
--      -- vía MCP Supabase: get_advisors(type=performance)
--    El conteo de auth_rls_initplan debe bajar de 20 a 0.
--
-- 3) SMOKE TEST funcional:
--      a) Login user normal: que vea sus templates de import (templates_select).
--      b) Login user normal: que vea sus jobs de import (import_jobs_select).
--      c) Login admin: que vea cron runs en /admin/observability.
--      d) Login user normal: que NO vea cron runs (no admin).
--      e) Endpoint público /buscador-clientes con session: lee/escribe sus propias rows.
--
-- 4) ROLLBACK si algo rompe — re-crear las policies originales:
--      -- Las definiciones originales están versionadas en migraciones previas
--      -- (v47-buscador-clientes, v48-product-import-jobs, v50-product-advanced,
--      --  v59-cron-observability, v66-visual-workflows). Buscar el CREATE POLICY
--      -- original y re-aplicarlo después del DROP correspondiente.
--      -- Patrón: el rollback es simétrico — donde dice (SELECT auth.uid())
--      -- volver a auth.uid() en cada policy.
-- ============================================================================
