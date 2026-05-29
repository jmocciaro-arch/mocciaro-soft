-- ============================================================================
-- v87: Crear índices para 162 foreign keys sin cobertura (PERFORMANCE)
-- ============================================================================
-- Fuente: Supabase advisor (performance) — lint unindexed_foreign_keys.
-- Verificado: 152 índices nuevos (10 FKs ya tienen índice parcial que el
-- advisor no detecta; los regeneramos igual con IF NOT EXISTS para idempotencia).
--
-- IMPORTANTE: USA CREATE INDEX CONCURRENTLY para no bloquear writes.
--   * NO se puede envolver en BEGIN/COMMIT (cada statement en su propia tx).
--   * Si un statement falla por "concurrent index creation already in progress",
--     re-ejecutar solo ese statement.
--   * Si un CONCURRENTLY falla por otro motivo, queda un índice "INVALID" —
--     hay que DROP INDEX <name> antes de reintentar.
--
-- Aplicar uno por uno con psql o copiando bloques al SQL Editor (NO ejecutar
-- el archivo entero con \i si tu cliente no soporta auto-commit por statement).
-- ============================================================================

-- Total: 162 indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_buscador_clientes_approved_by
  ON public.buscador_clientes(approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_agent_tasks_created_by
  ON public.tt_agent_tasks(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_ai_usage_company_id
  ON public.tt_ai_usage(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_alert_settings_user_id
  ON public.tt_alert_settings(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_alerts_assigned_to
  ON public.tt_alerts(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_alerts_client_id
  ON public.tt_alerts(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_alerts_created_by
  ON public.tt_alerts(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_alerts_document_id
  ON public.tt_alerts(document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_alerts_document_item_id
  ON public.tt_alerts(document_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_alerts_product_id
  ON public.tt_alerts(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_audit_log_changed_by_user_id
  ON public.tt_audit_log(changed_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_automations_company_id
  ON public.tt_automations(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_bank_statement_lines_confirmed_by
  ON public.tt_bank_statement_lines(confirmed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_bank_statement_lines_matched_client_id
  ON public.tt_bank_statement_lines(matched_client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_bank_statements_created_by
  ON public.tt_bank_statements(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_catalog_category_attributes_attribute_id
  ON public.tt_catalog_category_attributes(attribute_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_catalog_feeds_user_id
  ON public.tt_catalog_feeds(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_catalog_rules_user_id
  ON public.tt_catalog_rules(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_clients_assigned_to
  ON public.tt_clients(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_clients_company_id
  ON public.tt_clients(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_clients_price_list_id
  ON public.tt_clients(price_list_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_companies_parent_company_id
  ON public.tt_companies(parent_company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_company_whatsapp_accounts_created_by
  ON public.tt_company_whatsapp_accounts(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_contact_sync_log_client_id
  ON public.tt_contact_sync_log(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_cron_runs_triggered_by_user
  ON public.tt_cron_runs(triggered_by_user);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_custom_statuses_company_id
  ON public.tt_custom_statuses(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_delivery_notes_client_id
  ON public.tt_delivery_notes(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_delivery_notes_company_id
  ON public.tt_delivery_notes(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_delivery_notes_sales_order_id
  ON public.tt_delivery_notes(sales_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_delivery_notes_user_id
  ON public.tt_delivery_notes(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_digest_log_user_id
  ON public.tt_digest_log(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_dn_items_delivery_note_id
  ON public.tt_dn_items(delivery_note_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_dn_items_product_id
  ON public.tt_dn_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_dn_items_so_item_id
  ON public.tt_dn_items(so_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_attachments_uploaded_by_user_id
  ON public.tt_document_attachments(uploaded_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_item_components_parent_item_id
  ON public.tt_document_item_components(parent_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_item_components_product_id
  ON public.tt_document_item_components(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_items_po_document_id
  ON public.tt_document_items(po_document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_items_product_id
  ON public.tt_document_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_items_warehouse_id
  ON public.tt_document_items(warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_line_components_parent_item_id
  ON public.tt_document_line_components(parent_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_line_components_product_id
  ON public.tt_document_line_components(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_lines_product_id
  ON public.tt_document_lines(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_lines_warehouse_id
  ON public.tt_document_lines(warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_links_child_id
  ON public.tt_document_links(child_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_document_templates_company_id
  ON public.tt_document_templates(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_documents_assigned_to
  ON public.tt_documents(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_documents_user_id
  ON public.tt_documents(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_email_templates_company_id
  ON public.tt_email_templates(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_import_jobs_revert_job_id
  ON public.tt_import_jobs(revert_job_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_import_jobs_reverted_by
  ON public.tt_import_jobs(reverted_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_intercompany_relations_seller_company_id
  ON public.tt_intercompany_relations(seller_company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_invoice_items_delivery_note_id
  ON public.tt_invoice_items(delivery_note_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_invoice_items_invoice_id
  ON public.tt_invoice_items(invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_invoice_items_product_id
  ON public.tt_invoice_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_invoice_payments_created_by
  ON public.tt_invoice_payments(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_invoices_client_id
  ON public.tt_invoices(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_invoices_company_id
  ON public.tt_invoices(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_invoices_user_id
  ON public.tt_invoices(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_kit_components_component_product_id
  ON public.tt_kit_components(component_product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_lead_interactions_created_by
  ON public.tt_lead_interactions(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_leads_converted_client_id
  ON public.tt_leads(converted_client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_maintenance_schedules_asset_id
  ON public.tt_maintenance_schedules(asset_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_maintenance_schedules_assigned_to
  ON public.tt_maintenance_schedules(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_maintenance_schedules_client_id
  ON public.tt_maintenance_schedules(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_maintenance_schedules_company_id
  ON public.tt_maintenance_schedules(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_messages_author_user_id
  ON public.tt_messages(author_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_oc_audit_log_performed_by
  ON public.tt_oc_audit_log(performed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_oc_parsed_document_id
  ON public.tt_oc_parsed(document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_oc_parsed_validated_by
  ON public.tt_oc_parsed(validated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_opportunities_assigned_to
  ON public.tt_opportunities(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_opportunities_client_id
  ON public.tt_opportunities(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_opportunities_company_id
  ON public.tt_opportunities(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_opportunities_quote_id
  ON public.tt_opportunities(quote_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_opportunities_user_id
  ON public.tt_opportunities(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_payments_invoice_id
  ON public.tt_payments(invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_po_items_product_id
  ON public.tt_po_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_po_items_purchase_order_id
  ON public.tt_po_items(purchase_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_price_history_recorded_by
  ON public.tt_price_history(recorded_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_price_lists_company_id
  ON public.tt_price_lists(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_process_instances_assigned_to_user_id
  ON public.tt_process_instances(assigned_to_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_process_instances_created_by_user_id
  ON public.tt_process_instances(created_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_process_instances_supplier_id
  ON public.tt_process_instances(supplier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_process_stages_assigned_to_user_id
  ON public.tt_process_stages(assigned_to_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_process_stages_stage_definition_id
  ON public.tt_process_stages(stage_definition_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_product_families_parent_id
  ON public.tt_product_families(parent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_product_lots_supplier_id
  ON public.tt_product_lots(supplier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_product_lots_variant_id
  ON public.tt_product_lots(variant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_product_merge_log_merged_by
  ON public.tt_product_merge_log(merged_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_product_serials_variant_id
  ON public.tt_product_serials(variant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_product_serials_warehouse_id
  ON public.tt_product_serials(warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_products_merged_by
  ON public.tt_products(merged_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_public_forms_auto_sequence_id
  ON public.tt_public_forms(auto_sequence_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_credit_note_items_credit_note_id
  ON public.tt_purchase_credit_note_items(credit_note_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_credit_note_items_product_id
  ON public.tt_purchase_credit_note_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_credit_notes_company_id
  ON public.tt_purchase_credit_notes(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_credit_notes_purchase_invoice_id
  ON public.tt_purchase_credit_notes(purchase_invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_credit_notes_supplier_id
  ON public.tt_purchase_credit_notes(supplier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_invoice_items_confirmed_by
  ON public.tt_purchase_invoice_items(confirmed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_invoice_items_product_id
  ON public.tt_purchase_invoice_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_invoices_confirmed_by
  ON public.tt_purchase_invoices(confirmed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_invoices_purchase_order_id
  ON public.tt_purchase_invoices(purchase_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_invoices_supplier_id
  ON public.tt_purchase_invoices(supplier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_orders_company_id
  ON public.tt_purchase_orders(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_orders_user_id
  ON public.tt_purchase_orders(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_payments_created_by
  ON public.tt_purchase_payments(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_purchase_payments_purchase_order_id
  ON public.tt_purchase_payments(purchase_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_quote_items_product_id
  ON public.tt_quote_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_quote_items_quote_id
  ON public.tt_quote_items(quote_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_quotes_client_id
  ON public.tt_quotes(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_quotes_company_id
  ON public.tt_quotes(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_quotes_parent_quote_id
  ON public.tt_quotes(parent_quote_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_quotes_user_id
  ON public.tt_quotes(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_recurring_invoice_items_product_id
  ON public.tt_recurring_invoice_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_recurring_invoice_items_recurring_invoice_id
  ON public.tt_recurring_invoice_items(recurring_invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_recurring_invoices_client_id
  ON public.tt_recurring_invoices(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_recurring_invoices_company_id
  ON public.tt_recurring_invoices(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_recurring_invoices_created_by
  ON public.tt_recurring_invoices(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_role_permissions_permission_id
  ON public.tt_role_permissions(permission_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sales_orders_client_id
  ON public.tt_sales_orders(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sales_orders_company_id
  ON public.tt_sales_orders(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sales_orders_quote_id
  ON public.tt_sales_orders(quote_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sales_orders_user_id
  ON public.tt_sales_orders(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_bulk_quotes_created_by
  ON public.tt_sat_bulk_quotes(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_calendar_events_assigned_to
  ON public.tt_sat_calendar_events(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_calendar_events_maintenance_id
  ON public.tt_sat_calendar_events(maintenance_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_calendar_events_ticket_id
  ON public.tt_sat_calendar_events(ticket_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_tickets_assigned_to
  ON public.tt_sat_tickets(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_tickets_client_id
  ON public.tt_sat_tickets(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_tickets_company_id
  ON public.tt_sat_tickets(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sat_tickets_product_id
  ON public.tt_sat_tickets(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_scheduled_exports_template_id
  ON public.tt_scheduled_exports(template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_scheduled_exports_user_id
  ON public.tt_scheduled_exports(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_signatures_quote_id
  ON public.tt_signatures(quote_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sku_aliases_client_id
  ON public.tt_sku_aliases(client_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_sku_aliases_created_by
  ON public.tt_sku_aliases(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_so_items_product_id
  ON public.tt_so_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_so_items_sales_order_id
  ON public.tt_so_items(sales_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_warehouse_id
  ON public.tt_stock(warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_movements_destination_warehouse_id
  ON public.tt_stock_movements(destination_warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_movements_document_id
  ON public.tt_stock_movements(document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_movements_document_item_id
  ON public.tt_stock_movements(document_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_movements_origin_warehouse_id
  ON public.tt_stock_movements(origin_warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_movements_user_id
  ON public.tt_stock_movements(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_movements_warehouse_id
  ON public.tt_stock_movements(warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_reservations_created_by
  ON public.tt_stock_reservations(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_stock_reservations_warehouse_id
  ON public.tt_stock_reservations(warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_supplier_offer_items_offer_id
  ON public.tt_supplier_offer_items(offer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_supplier_offer_items_product_id
  ON public.tt_supplier_offer_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_supplier_offers_company_id
  ON public.tt_supplier_offers(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_supplier_offers_created_by
  ON public.tt_supplier_offers(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_supplier_offers_supplier_id
  ON public.tt_supplier_offers(supplier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_threads_created_by_user_id
  ON public.tt_threads(created_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_user_companies_company_id
  ON public.tt_user_companies(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_user_roles_role_id
  ON public.tt_user_roles(role_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_user_teams_team_id
  ON public.tt_user_teams(team_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_users_company_id
  ON public.tt_users(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_visual_workflows_created_by_user_id
  ON public.tt_visual_workflows(created_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_visual_workflows_parent_template_id
  ON public.tt_visual_workflows(parent_template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_warehouses_company_id
  ON public.tt_warehouses(company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_whatsapp_messages_sent_by
  ON public.tt_whatsapp_messages(sent_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tt_workflow_nodes_process_stage_id
  ON public.tt_workflow_nodes(process_stage_id);

-- ============================================================================
-- INSTRUCCIONES DE APLICACIÓN
-- ============================================================================
-- 1) APLICAR (recomendado: psql con autocommit habilitado):
--      psql "$DATABASE_URL" --single-transaction=off \
--           -f supabase/migrations/v87_index_critical_fks.sql
--
--    O desde Supabase SQL Editor: pegar bloques de ~20 statements y ejecutar.
--    El SQL Editor ejecuta cada statement en su propia transacción
--    automáticamente, así que CONCURRENTLY funciona OK.
--
-- 2) VERIFICAR post-apply (no debe haber índices INVALID):
--      SELECT i.indrelid::regclass AS tabla, c.relname AS indice
--      FROM pg_index i
--      JOIN pg_class c ON c.oid = i.indexrelid
--      WHERE NOT i.indisvalid
--        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');
--      -- Debe devolver 0 filas.
--
--      -- Contar nuevos índices creados:
--      SELECT COUNT(*) FROM pg_indexes
--      WHERE schemaname='public' AND indexname LIKE 'idx_%';
--
-- 3) RE-CORRER advisor para confirmar que el lint unindexed_foreign_keys
--    baja de 162 a ~0:
--      -- vía MCP Supabase: get_advisors(type=performance)
--
-- 4) ROLLBACK si alguno causa problemas (caso muy improbable, índices son
--    no-destructivos):
--      DROP INDEX CONCURRENTLY IF EXISTS public.<idx_name>;
--
-- 5) NOTA sobre tablas grandes — estos índices van a tardar:
--      * tt_price_list_items (112k rows) — N/A: ya tiene FK indexada
--      * tt_stock (42k rows) — idx_tt_stock_warehouse_id (segundos)
--      * tt_products (23k rows) — idx_tt_products_merged_by (segundos)
--      * tt_historical_data (18k rows) — N/A: no aparece en lista
--      * tt_price_history (4.8k rows) — idx_tt_price_history_recorded_by
--    El resto tienen <2k rows. Total estimado: <5 min.
-- ============================================================================
