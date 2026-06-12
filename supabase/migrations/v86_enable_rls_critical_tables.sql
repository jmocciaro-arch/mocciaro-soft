-- ============================================================================
-- v86: Habilitar RLS en 5 tablas críticas con aislamiento multi-empresa
-- ============================================================================
-- Tablas: tt_invoices, tt_payments, tt_bank_movements, tt_clients, tt_purchase_invoices
--
-- IMPORTANTE: NO APLICAR sin smoke test previo. Ver INSTRUCCIONES al final.
--
-- Notas de diseño:
--   * tt_user_companies.user_id apunta a tt_users.id (NO a auth.uid()).
--     La membresía se resuelve via: tt_users.auth_id = auth.uid().
--   * Helper CTE/EXISTS hace JOIN tt_users -> tt_user_companies para obtener
--     companies del usuario logueado. Envuelto en (SELECT ...) para que el
--     planner lo evalúe una sola vez por query (initplan caching).
--   * Casos sin company_id directo:
--       - tt_payments: usa invoice_id -> tt_invoices.company_id
--       - tt_purchase_invoices: usa supplier_id -> tt_suppliers.company_id
--         (alternativamente purchase_order_id -> tt_purchase_orders.company_id,
--          pero ese FK puede ser NULL en facturas sin OC)
--       - tt_bank_movements: NO tiene company_id ni FK a tabla con company.
--         Es global por ahora (TODAS las cuentas bancarias). Política
--         provisional: solo authenticated puede leer (sin aislamiento).
--         -- VERIFICAR: en el futuro agregar tt_bank_movements.company_id
--         -- vinculando con tt_company_bank_accounts via account_iban.
--   * service_role siempre tiene acceso total (para crons, jobs y server-side).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) tt_invoices (company_id directo)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tt_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_invoices_select_company_isolation ON public.tt_invoices;
CREATE POLICY tt_invoices_select_company_isolation
  ON public.tt_invoices FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_invoices_insert_company_isolation ON public.tt_invoices;
CREATE POLICY tt_invoices_insert_company_isolation
  ON public.tt_invoices FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_invoices_update_company_isolation ON public.tt_invoices;
CREATE POLICY tt_invoices_update_company_isolation
  ON public.tt_invoices FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_invoices_delete_company_isolation ON public.tt_invoices;
CREATE POLICY tt_invoices_delete_company_isolation
  ON public.tt_invoices FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_invoices_service_role_all ON public.tt_invoices;
CREATE POLICY tt_invoices_service_role_all
  ON public.tt_invoices FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2) tt_clients (company_id directo)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tt_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_clients_select_company_isolation ON public.tt_clients;
CREATE POLICY tt_clients_select_company_isolation
  ON public.tt_clients FOR SELECT TO authenticated
  USING (
    company_id IS NULL  -- clientes globales (legacy) visibles para todos
    OR company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_clients_insert_company_isolation ON public.tt_clients;
CREATE POLICY tt_clients_insert_company_isolation
  ON public.tt_clients FOR INSERT TO authenticated
  WITH CHECK (
    company_id IS NULL
    OR company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_clients_update_company_isolation ON public.tt_clients;
CREATE POLICY tt_clients_update_company_isolation
  ON public.tt_clients FOR UPDATE TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    company_id IS NULL
    OR company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_clients_delete_company_isolation ON public.tt_clients;
CREATE POLICY tt_clients_delete_company_isolation
  ON public.tt_clients FOR DELETE TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT uc.company_id
      FROM public.tt_user_companies uc
      JOIN public.tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tt_clients_service_role_all ON public.tt_clients;
CREATE POLICY tt_clients_service_role_all
  ON public.tt_clients FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3) tt_payments (sin company_id directo — usar invoice_id -> tt_invoices)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tt_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_payments_select_via_invoice ON public.tt_payments;
CREATE POLICY tt_payments_select_via_invoice
  ON public.tt_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tt_invoices i
      WHERE i.id = tt_payments.invoice_id
        AND i.company_id IN (
          SELECT uc.company_id
          FROM public.tt_user_companies uc
          JOIN public.tt_users u ON u.id = uc.user_id
          WHERE u.auth_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS tt_payments_insert_via_invoice ON public.tt_payments;
CREATE POLICY tt_payments_insert_via_invoice
  ON public.tt_payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tt_invoices i
      WHERE i.id = tt_payments.invoice_id
        AND i.company_id IN (
          SELECT uc.company_id
          FROM public.tt_user_companies uc
          JOIN public.tt_users u ON u.id = uc.user_id
          WHERE u.auth_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS tt_payments_update_via_invoice ON public.tt_payments;
CREATE POLICY tt_payments_update_via_invoice
  ON public.tt_payments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tt_invoices i
      WHERE i.id = tt_payments.invoice_id
        AND i.company_id IN (
          SELECT uc.company_id
          FROM public.tt_user_companies uc
          JOIN public.tt_users u ON u.id = uc.user_id
          WHERE u.auth_id = (SELECT auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tt_invoices i
      WHERE i.id = tt_payments.invoice_id
        AND i.company_id IN (
          SELECT uc.company_id
          FROM public.tt_user_companies uc
          JOIN public.tt_users u ON u.id = uc.user_id
          WHERE u.auth_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS tt_payments_delete_via_invoice ON public.tt_payments;
CREATE POLICY tt_payments_delete_via_invoice
  ON public.tt_payments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tt_invoices i
      WHERE i.id = tt_payments.invoice_id
        AND i.company_id IN (
          SELECT uc.company_id
          FROM public.tt_user_companies uc
          JOIN public.tt_users u ON u.id = uc.user_id
          WHERE u.auth_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS tt_payments_service_role_all ON public.tt_payments;
CREATE POLICY tt_payments_service_role_all
  ON public.tt_payments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4) tt_purchase_invoices (sin company_id directo — usar supplier_id -> tt_suppliers)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tt_purchase_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_purchase_invoices_select_via_supplier ON public.tt_purchase_invoices;
CREATE POLICY tt_purchase_invoices_select_via_supplier
  ON public.tt_purchase_invoices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tt_suppliers s
      WHERE s.id = tt_purchase_invoices.supplier_id
        AND (
          s.company_id IS NULL  -- proveedores globales (legacy)
          OR s.company_id IN (
            SELECT uc.company_id
            FROM public.tt_user_companies uc
            JOIN public.tt_users u ON u.id = uc.user_id
            WHERE u.auth_id = (SELECT auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS tt_purchase_invoices_insert_via_supplier ON public.tt_purchase_invoices;
CREATE POLICY tt_purchase_invoices_insert_via_supplier
  ON public.tt_purchase_invoices FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tt_suppliers s
      WHERE s.id = tt_purchase_invoices.supplier_id
        AND (
          s.company_id IS NULL
          OR s.company_id IN (
            SELECT uc.company_id
            FROM public.tt_user_companies uc
            JOIN public.tt_users u ON u.id = uc.user_id
            WHERE u.auth_id = (SELECT auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS tt_purchase_invoices_update_via_supplier ON public.tt_purchase_invoices;
CREATE POLICY tt_purchase_invoices_update_via_supplier
  ON public.tt_purchase_invoices FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tt_suppliers s
      WHERE s.id = tt_purchase_invoices.supplier_id
        AND (
          s.company_id IS NULL
          OR s.company_id IN (
            SELECT uc.company_id
            FROM public.tt_user_companies uc
            JOIN public.tt_users u ON u.id = uc.user_id
            WHERE u.auth_id = (SELECT auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tt_suppliers s
      WHERE s.id = tt_purchase_invoices.supplier_id
        AND (
          s.company_id IS NULL
          OR s.company_id IN (
            SELECT uc.company_id
            FROM public.tt_user_companies uc
            JOIN public.tt_users u ON u.id = uc.user_id
            WHERE u.auth_id = (SELECT auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS tt_purchase_invoices_delete_via_supplier ON public.tt_purchase_invoices;
CREATE POLICY tt_purchase_invoices_delete_via_supplier
  ON public.tt_purchase_invoices FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tt_suppliers s
      WHERE s.id = tt_purchase_invoices.supplier_id
        AND (
          s.company_id IS NULL
          OR s.company_id IN (
            SELECT uc.company_id
            FROM public.tt_user_companies uc
            JOIN public.tt_users u ON u.id = uc.user_id
            WHERE u.auth_id = (SELECT auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS tt_purchase_invoices_service_role_all ON public.tt_purchase_invoices;
CREATE POLICY tt_purchase_invoices_service_role_all
  ON public.tt_purchase_invoices FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5) tt_bank_movements (sin company_id — global, solo authenticated)
-- VERIFICAR: agregar company_id en migración futura para aislar movimientos
-- por empresa (matchear via account_iban contra tt_company_bank_accounts).
-- ----------------------------------------------------------------------------
ALTER TABLE public.tt_bank_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_bank_movements_select_authenticated ON public.tt_bank_movements;
CREATE POLICY tt_bank_movements_select_authenticated
  ON public.tt_bank_movements FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS tt_bank_movements_insert_authenticated ON public.tt_bank_movements;
CREATE POLICY tt_bank_movements_insert_authenticated
  ON public.tt_bank_movements FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS tt_bank_movements_update_authenticated ON public.tt_bank_movements;
CREATE POLICY tt_bank_movements_update_authenticated
  ON public.tt_bank_movements FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tt_bank_movements_delete_authenticated ON public.tt_bank_movements;
CREATE POLICY tt_bank_movements_delete_authenticated
  ON public.tt_bank_movements FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS tt_bank_movements_service_role_all ON public.tt_bank_movements;
CREATE POLICY tt_bank_movements_service_role_all
  ON public.tt_bank_movements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- INSTRUCCIONES DE APLICACIÓN
-- ============================================================================
-- 1) ANTES de aplicar:
--    a) Smoke test manual en staging:
--       - Loguearse como user normal y verificar que ve facturas/clientes
--         de SUS empresas.
--       - Loguearse como user de otra empresa y verificar que NO ve datos
--         ajenos.
--       - Probar crear factura desde el cotizador (server-side) — debe
--         funcionar usando service_role.
--       - Probar cron de alertas de pago (uses service_role) — debe leer
--         todas las facturas.
--    b) Verificar que TODOS los endpoints server-side que tocan estas tablas
--       usan supabaseAdmin / service_role. Si alguno usa anon/authenticated
--       sin pasar company_id correcto, va a romper.
--       Endpoints sospechosos a revisar:
--         - /api/cron/payment-alerts
--         - /api/invoices/*
--         - /api/clients/*
--         - /api/payments/*
--         - /api/purchase-invoices/*
--         - /api/bank-movements/*
--
-- 2) APLICAR via Supabase SQL Editor (recomendado para visualizar errores)
--    o psql:
--      psql "$DATABASE_URL" -f supabase/migrations/v86_enable_rls_critical_tables.sql
--
-- 3) VERIFICAR post-apply:
--      SELECT tablename, rowsecurity
--      FROM pg_tables
--      WHERE schemaname='public'
--        AND tablename IN (
--          'tt_invoices','tt_payments','tt_bank_movements',
--          'tt_clients','tt_purchase_invoices'
--        );
--      -- Todas deben tener rowsecurity=true.
--
--      SELECT tablename, COUNT(*) AS num_policies
--      FROM pg_policies
--      WHERE schemaname='public'
--        AND tablename IN (
--          'tt_invoices','tt_payments','tt_bank_movements',
--          'tt_clients','tt_purchase_invoices'
--        )
--      GROUP BY tablename;
--      -- Esperado: 5 policies por tabla (select+insert+update+delete+service_role).
--
-- 4) ROLLBACK si algo rompe:
--      ALTER TABLE public.tt_invoices           DISABLE ROW LEVEL SECURITY;
--      ALTER TABLE public.tt_clients            DISABLE ROW LEVEL SECURITY;
--      ALTER TABLE public.tt_payments           DISABLE ROW LEVEL SECURITY;
--      ALTER TABLE public.tt_purchase_invoices  DISABLE ROW LEVEL SECURITY;
--      ALTER TABLE public.tt_bank_movements     DISABLE ROW LEVEL SECURITY;
--      -- Las policies quedan pero inactivas; opcionalmente DROP POLICY ... .
-- ============================================================================
