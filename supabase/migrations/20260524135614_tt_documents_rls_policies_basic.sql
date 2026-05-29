-- Policies mínimas para tt_documents (estaba con RLS habilitada pero sin policies = deny all)
-- Filtra por company_id que pertenezca al user vía tt_user_companies.

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

DROP POLICY IF EXISTS tt_documents_service_role_all ON tt_documents;
CREATE POLICY tt_documents_service_role_all
  ON tt_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);
