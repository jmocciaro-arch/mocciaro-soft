-- =============================================================================
-- MIGRATION v36 — Cierre Fase EMPRESAS · Seguridad y RLS
-- =============================================================================
-- Endurece:
--   - CHECK de tt_users.role (admite super_admin)
--   - Helpers SQL para RLS (fn_is_admin_user, fn_user_has_company_access)
--   - RLS real en tt_companies y tablas satélite (v35)
--   - Policies de Storage para bucket company-documents
--
-- Depende de: v35 (migration-v35-companies-phase.sql)
-- Idempotente.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ampliar CHECK de tt_users.role para admitir super_admin
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  -- Buscar el CHECK actual sobre la columna role
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'tt_users'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%role%IN%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tt_users DROP CONSTRAINT %I', v_conname);
  END IF;

  -- Nuevo CHECK amplio
  ALTER TABLE tt_users
    ADD CONSTRAINT tt_users_role_chk
    CHECK (role IN ('admin', 'super_admin', 'superadmin', 'vendedor', 'viewer'));
END$$;


-- -----------------------------------------------------------------------------
-- 2. Helpers SQL usadas por las RLS
-- -----------------------------------------------------------------------------

-- tt_user id del usuario autenticado actual (NULL si no auth)
CREATE OR REPLACE FUNCTION fn_current_tt_user_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tt_users WHERE auth_id = auth.uid() LIMIT 1
$$;

-- Es admin o super_admin (rol en tt_users)
CREATE OR REPLACE FUNCTION fn_is_admin_user()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tt_users
    WHERE auth_id = auth.uid()
      AND role IN ('admin', 'super_admin', 'superadmin')
      AND COALESCE(active, true) = true
  )
$$;

-- Es super_admin (solo ese rol)
CREATE OR REPLACE FUNCTION fn_is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tt_users
    WHERE auth_id = auth.uid()
      AND role IN ('super_admin', 'superadmin')
      AND COALESCE(active, true) = true
  )
$$;

-- Tiene acceso a una empresa vía tt_user_companies (admin/super_admin ven todo)
CREATE OR REPLACE FUNCTION fn_user_has_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fn_is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM tt_user_companies uc
      JOIN tt_users u ON u.id = uc.user_id
      WHERE u.auth_id = auth.uid()
        AND uc.company_id = p_company_id
    )
$$;

GRANT EXECUTE ON FUNCTION fn_current_tt_user_id()        TO authenticated;
GRANT EXECUTE ON FUNCTION fn_is_admin_user()             TO authenticated;
GRANT EXECUTE ON FUNCTION fn_is_super_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION fn_user_has_company_access(UUID) TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. Limpiar policies permisivas de v35 (las dejábamos abiertas)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'tt_company_fiscal_profiles',
    'tt_company_addresses',
    'tt_company_bank_accounts',
    'tt_company_currencies',
    'tt_company_legal_representatives',
    'tt_company_documents',
    'tt_country_fiscal_schemas'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
  END LOOP;
END$$;


-- -----------------------------------------------------------------------------
-- 4. RLS tt_companies
-- -----------------------------------------------------------------------------

ALTER TABLE tt_companies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Limpiar policies existentes con los nombres nuevos
  DROP POLICY IF EXISTS tt_companies_select ON tt_companies;
  DROP POLICY IF EXISTS tt_companies_insert ON tt_companies;
  DROP POLICY IF EXISTS tt_companies_update ON tt_companies;
  DROP POLICY IF EXISTS tt_companies_delete ON tt_companies;
  DROP POLICY IF EXISTS tt_companies_service_role ON tt_companies;
END$$;

-- Service role: acceso total (endpoints server-side)
CREATE POLICY tt_companies_service_role ON tt_companies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Usuarios autenticados: solo ven empresas a las que tienen acceso
CREATE POLICY tt_companies_select ON tt_companies
  FOR SELECT TO authenticated
  USING (fn_user_has_company_access(id));

-- Solo admin puede crear empresas
CREATE POLICY tt_companies_insert ON tt_companies
  FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin_user());

-- Solo admin puede modificar (y además tiene que tener acceso a la empresa)
CREATE POLICY tt_companies_update ON tt_companies
  FOR UPDATE TO authenticated
  USING (fn_is_admin_user() AND fn_user_has_company_access(id))
  WITH CHECK (fn_is_admin_user());

-- Solo super_admin puede borrar
CREATE POLICY tt_companies_delete ON tt_companies
  FOR DELETE TO authenticated
  USING (fn_is_super_admin());


-- -----------------------------------------------------------------------------
-- 5. RLS tablas satélite (mismo patrón para las 6)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'tt_company_fiscal_profiles',
    'tt_company_addresses',
    'tt_company_bank_accounts',
    'tt_company_currencies',
    'tt_company_legal_representatives',
    'tt_company_documents'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Service role full
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service_role', t
    );

    -- SELECT: tiene acceso a la empresa
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (fn_user_has_company_access(company_id))',
      t || '_select', t
    );

    -- INSERT: admin + acceso a la empresa destino
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (fn_is_admin_user() AND fn_user_has_company_access(company_id))',
      t || '_insert', t
    );

    -- UPDATE: admin + acceso
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (fn_is_admin_user() AND fn_user_has_company_access(company_id)) WITH CHECK (fn_is_admin_user() AND fn_user_has_company_access(company_id))',
      t || '_update', t
    );

    -- DELETE: admin + acceso
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (fn_is_admin_user() AND fn_user_has_company_access(company_id))',
      t || '_delete', t
    );
  END LOOP;
END$$;


-- -----------------------------------------------------------------------------
-- 6. RLS tt_country_fiscal_schemas (diccionario público para authenticated)
-- -----------------------------------------------------------------------------

ALTER TABLE tt_country_fiscal_schemas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_country_fiscal_schemas_service_role ON tt_country_fiscal_schemas;
CREATE POLICY tt_country_fiscal_schemas_service_role ON tt_country_fiscal_schemas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tt_country_fiscal_schemas_select ON tt_country_fiscal_schemas;
CREATE POLICY tt_country_fiscal_schemas_select ON tt_country_fiscal_schemas
  FOR SELECT TO authenticated USING (true);

-- Solo super_admin puede tocar el diccionario
DROP POLICY IF EXISTS tt_country_fiscal_schemas_write ON tt_country_fiscal_schemas;
CREATE POLICY tt_country_fiscal_schemas_write ON tt_country_fiscal_schemas
  FOR ALL TO authenticated
  USING (fn_is_super_admin())
  WITH CHECK (fn_is_super_admin());


-- -----------------------------------------------------------------------------
-- 7. Storage bucket company-documents — privado por empresa
-- -----------------------------------------------------------------------------
-- Convención de paths: '<company_id>/<filename>' (asumido por tab-documents.tsx)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    -- Garantizar que el bucket exista y sea privado
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('company-documents', 'company-documents', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;
END$$;

-- Policies sobre storage.objects
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN

    -- SELECT: leer solo objetos cuyo primer segmento (company_id) el usuario puede ver
    DROP POLICY IF EXISTS company_documents_select ON storage.objects;
    CREATE POLICY company_documents_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'company-documents'
        AND fn_user_has_company_access((storage.foldername(name))[1]::uuid)
      );

    -- INSERT: solo admin con acceso a la empresa destino
    DROP POLICY IF EXISTS company_documents_insert ON storage.objects;
    CREATE POLICY company_documents_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'company-documents'
        AND fn_is_admin_user()
        AND fn_user_has_company_access((storage.foldername(name))[1]::uuid)
      );

    -- UPDATE: solo admin con acceso (ej. renombrar)
    DROP POLICY IF EXISTS company_documents_update ON storage.objects;
    CREATE POLICY company_documents_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'company-documents'
        AND fn_is_admin_user()
        AND fn_user_has_company_access((storage.foldername(name))[1]::uuid)
      )
      WITH CHECK (
        bucket_id = 'company-documents'
        AND fn_is_admin_user()
        AND fn_user_has_company_access((storage.foldername(name))[1]::uuid)
      );

    -- DELETE: solo admin con acceso
    DROP POLICY IF EXISTS company_documents_delete ON storage.objects;
    CREATE POLICY company_documents_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'company-documents'
        AND fn_is_admin_user()
        AND fn_user_has_company_access((storage.foldername(name))[1]::uuid)
      );

    -- Service role full
    DROP POLICY IF EXISTS company_documents_service_role ON storage.objects;
    CREATE POLICY company_documents_service_role ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'company-documents')
      WITH CHECK (bucket_id = 'company-documents');

  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 8. Verificación rápida (comentada)
-- -----------------------------------------------------------------------------
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'tt_companies';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

COMMIT;

-- =============================================================================
-- FIN migration v36
-- =============================================================================
