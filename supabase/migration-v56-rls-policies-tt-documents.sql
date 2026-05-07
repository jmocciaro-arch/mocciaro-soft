-- Migration v56 — RLS policies estrictas para tt_documents (NO habilita RLS)
--
-- WHY: tt_documents es la tabla más crítica del modelo unificado. Hoy
-- NO tiene RLS habilitada — cualquier query con anon key + JWT lee
-- todo. La regla de oro multi-empresa solo se aplica en código.
--
-- ESTRATEGIA: crear policies primero (sin habilitar RLS) para validar
-- la sintaxis y dejar listo el enable. La activación efectiva (ALTER
-- TABLE ... ENABLE ROW LEVEL SECURITY) queda para una migración
-- posterior, después de que confirmamos que la app sigue funcionando
-- con tt_stock_reservations endurecida (v55).
--
-- ACTIVACIÓN MANUAL (cuando estés listo, ejecutar en SQL Editor):
--   ALTER TABLE tt_documents ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE tt_documents FORCE ROW LEVEL SECURITY; -- opcional, fuerza incluso al owner
--
-- ROLLBACK ACTIVACIÓN (si algo se rompe):
--   ALTER TABLE tt_documents DISABLE ROW LEVEL SECURITY;
--
-- HOW TO APPLY: SQL Editor. Idempotente.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Policies para tt_documents (idempotentes — DROP IF EXISTS antes)
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_select_by_company" ON tt_documents;
DROP POLICY IF EXISTS "documents_insert_by_company" ON tt_documents;
DROP POLICY IF EXISTS "documents_update_by_company" ON tt_documents;
DROP POLICY IF EXISTS "documents_delete_by_company" ON tt_documents;

-- Lectura: el usuario ve documentos de empresas a las que tiene acceso.
CREATE POLICY "documents_select_by_company"
  ON tt_documents FOR SELECT
  TO authenticated
  USING (app_can_see_company(company_id));

-- Inserción: solo permite crear docs en empresas accesibles.
CREATE POLICY "documents_insert_by_company"
  ON tt_documents FOR INSERT
  TO authenticated
  WITH CHECK (app_can_see_company(company_id));

-- Update: solo si el doc actual pertenece a una empresa accesible Y el
-- nuevo company_id (si cambia) también lo es.
CREATE POLICY "documents_update_by_company"
  ON tt_documents FOR UPDATE
  TO authenticated
  USING (app_can_see_company(company_id))
  WITH CHECK (app_can_see_company(company_id));

-- Delete: solo si la empresa es accesible.
CREATE POLICY "documents_delete_by_company"
  ON tt_documents FOR DELETE
  TO authenticated
  USING (app_can_see_company(company_id));

-- ─────────────────────────────────────────────────────────────────────
-- Policies para tt_document_items (heredadas vía documento padre)
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "document_items_select_by_parent" ON tt_document_items;
DROP POLICY IF EXISTS "document_items_insert_by_parent" ON tt_document_items;
DROP POLICY IF EXISTS "document_items_update_by_parent" ON tt_document_items;
DROP POLICY IF EXISTS "document_items_delete_by_parent" ON tt_document_items;

CREATE POLICY "document_items_select_by_parent"
  ON tt_document_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_document_items.document_id
        AND app_can_see_company(d.company_id)
    )
  );

CREATE POLICY "document_items_insert_by_parent"
  ON tt_document_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_document_items.document_id
        AND app_can_see_company(d.company_id)
    )
  );

CREATE POLICY "document_items_update_by_parent"
  ON tt_document_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_document_items.document_id
        AND app_can_see_company(d.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_document_items.document_id
        AND app_can_see_company(d.company_id)
    )
  );

CREATE POLICY "document_items_delete_by_parent"
  ON tt_document_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE d.id = tt_document_items.document_id
        AND app_can_see_company(d.company_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Policies para tt_document_links (heredadas)
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "document_links_select_by_parent" ON tt_document_links;
DROP POLICY IF EXISTS "document_links_modify_by_parent" ON tt_document_links;

CREATE POLICY "document_links_select_by_parent"
  ON tt_document_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE (d.id = tt_document_links.parent_id OR d.id = tt_document_links.child_id)
        AND app_can_see_company(d.company_id)
    )
  );

CREATE POLICY "document_links_modify_by_parent"
  ON tt_document_links FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE (d.id = tt_document_links.parent_id OR d.id = tt_document_links.child_id)
        AND app_can_see_company(d.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tt_documents d
      WHERE (d.id = tt_document_links.parent_id OR d.id = tt_document_links.child_id)
        AND app_can_see_company(d.company_id)
    )
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- ACTIVACIÓN GRADUAL (NO ejecutar todavía — esperar validación)
-- ─────────────────────────────────────────────────────────────────────
-- Cuando confirmemos que la app sigue funcionando con stock_reservations
-- RLS endurecida (v55) por ~1 semana de uso real, ejecutar:
--
-- BEGIN;
-- ALTER TABLE tt_documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tt_document_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tt_document_links ENABLE ROW LEVEL SECURITY;
-- COMMIT;
--
-- service_role bypassea RLS automáticamente. authenticated users con
-- JWT verán solo docs/items/links de empresas accesibles.
-- ─────────────────────────────────────────────────────────────────────
