-- Baseline RLS: enable RLS + permissive policy "authenticated can do anything".
-- Cierra el agujero crítico (anon role lee/escribe todo). No filtra por company aún;
-- esa capa va en una segunda migración con políticas company-aware.

DO $$
DECLARE
  t TEXT;
  tables_to_protect TEXT[] := ARRAY[
    'tt_companies','tt_users','tt_products','tt_clients','tt_warehouses','tt_stock',
    'tt_quotes','tt_quote_items','tt_sales_orders','tt_so_items','tt_delivery_notes',
    'tt_dn_items','tt_invoices','tt_invoice_items','tt_payments','tt_opportunities',
    'tt_purchase_orders','tt_po_items','tt_sat_tickets','tt_system_params','tt_suppliers',
    'tt_assets','tt_historical_data','tt_bank_movements','tt_supplier_contacts','tt_teams',
    'tt_roles','tt_permissions','tt_role_permissions','tt_user_roles','tt_user_teams',
    'tt_client_relations','tt_contact_sync_log','tt_document_sequences','tt_sku_aliases'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_protect LOOP
    -- 1) Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- 2) Drop existing baseline policy if it exists (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON public.%I', t);

    -- 3) Create policy: authenticated users have full access; anon blocked
    EXECUTE format(
      'CREATE POLICY authenticated_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
