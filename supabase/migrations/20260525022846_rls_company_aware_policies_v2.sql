DO $$
DECLARE
  t TEXT;
  excluded TEXT[] := ARRAY['tt_companies', 'tt_users', 'tt_user_companies', 'tt_warehouses'];
  company_tables TEXT[] := ARRAY[
    'tt_agent_tasks','tt_ai_summaries','tt_ai_usage','tt_alert_settings','tt_automations',
    'tt_bank_statements','tt_cashflow_snapshots','tt_catalog_feeds','tt_catalog_rules',
    'tt_client_company_tax_config','tt_client_portal_tokens','tt_clients',
    'tt_company_bank_accounts','tt_company_whatsapp_accounts','tt_custom_statuses',
    'tt_delivery_notes','tt_digest_log','tt_doc_actions_log','tt_document_events',
    'tt_document_sends','tt_document_sequences','tt_document_share_links',
    'tt_document_templates','tt_documents','tt_email_log','tt_email_sequences',
    'tt_email_templates','tt_generated_alerts','tt_import_jobs','tt_import_templates',
    'tt_invoice_providers','tt_invoices','tt_leads','tt_maintenance_schedules',
    'tt_migration_log','tt_opportunities','tt_price_lists','tt_process_instances',
    'tt_product_prices','tt_public_forms','tt_purchase_credit_notes',
    'tt_purchase_orders','tt_quotes','tt_recurring_invoices','tt_reminders',
    'tt_sales_orders','tt_sat_assets','tt_sat_bulk_quotes','tt_sat_manuals',
    'tt_sat_service_history','tt_sat_tickets','tt_scheduled_actions',
    'tt_scheduled_exports','tt_sku_aliases','tt_supplier_offers','tt_suppliers',
    'tt_tango_maestros_cache','tt_visual_workflows','tt_whatsapp_messages'
  ];
BEGIN
  FOREACH t IN ARRAY company_tables LOOP
    IF t = ANY(excluded) THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS company_aware_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS company_aware_modify ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY company_aware_select ON public.%I FOR SELECT TO authenticated USING (company_id = ANY(auth_user_company_ids()))',
      t
    );
    EXECUTE format(
      'CREATE POLICY company_aware_modify ON public.%I FOR ALL TO authenticated USING (company_id = ANY(auth_user_company_ids())) WITH CHECK (company_id = ANY(auth_user_company_ids()))',
      t
    );
  END LOOP;
END $$;
