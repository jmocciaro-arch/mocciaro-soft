DROP POLICY IF EXISTS "Users can view own company access" ON public.tt_user_companies;
CREATE POLICY "Users can view own company access"
  ON public.tt_user_companies FOR SELECT TO authenticated
  USING (user_id IN (SELECT tt_users.id FROM public.tt_users WHERE tt_users.auth_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS fein_models_select_authenticated ON public.tt_fein_models;
CREATE POLICY fein_models_select_authenticated
  ON public.tt_fein_models FOR SELECT TO public
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "buscador: user reads own" ON public.buscador_clientes;
CREATE POLICY "buscador: user reads own"
  ON public.buscador_clientes FOR SELECT TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "buscador: user inserts own" ON public.buscador_clientes;
CREATE POLICY "buscador: user inserts own"
  ON public.buscador_clientes FOR INSERT TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS auth_all ON public.tt_scheduled_exports;
CREATE POLICY auth_all
  ON public.tt_scheduled_exports FOR ALL TO public
  USING ((SELECT auth.role()) = 'authenticated'::text);

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

DROP POLICY IF EXISTS import_jobs_insert ON public.tt_import_jobs;
CREATE POLICY import_jobs_insert
  ON public.tt_import_jobs FOR INSERT TO public
  WITH CHECK ((user_id = (SELECT auth.uid())) OR (user_id IS NULL));

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

DROP POLICY IF EXISTS auth_all ON public.tt_product_variants;
CREATE POLICY auth_all ON public.tt_product_variants FOR ALL TO public USING ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS auth_all ON public.tt_product_variant_attributes;
CREATE POLICY auth_all ON public.tt_product_variant_attributes FOR ALL TO public USING ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS auth_all ON public.tt_product_lots;
CREATE POLICY auth_all ON public.tt_product_lots FOR ALL TO public USING ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS auth_all ON public.tt_product_serials;
CREATE POLICY auth_all ON public.tt_product_serials FOR ALL TO public USING ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS auth_all ON public.tt_product_translations;
CREATE POLICY auth_all ON public.tt_product_translations FOR ALL TO public USING ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS auth_all ON public.tt_catalog_feeds;
CREATE POLICY auth_all ON public.tt_catalog_feeds FOR ALL TO public USING ((SELECT auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS auth_all ON public.tt_catalog_rules;
CREATE POLICY auth_all ON public.tt_catalog_rules FOR ALL TO public USING ((SELECT auth.role()) = 'authenticated'::text);

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

DROP POLICY IF EXISTS templates_insert ON public.tt_import_templates;
CREATE POLICY templates_insert ON public.tt_import_templates FOR INSERT TO public WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS templates_update ON public.tt_import_templates;
CREATE POLICY templates_update ON public.tt_import_templates FOR UPDATE TO public USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS templates_delete ON public.tt_import_templates;
CREATE POLICY templates_delete ON public.tt_import_templates FOR DELETE TO public USING (user_id = (SELECT auth.uid()));

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
