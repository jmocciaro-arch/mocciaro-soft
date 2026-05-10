-- =====================================================
-- v68 — Adjuntos por documento (OC original, pliegos, planos, etc.)
-- =====================================================
-- Cada documento (cotización, pedido, factura, OC compra...) puede tener
-- N archivos adjuntos categorizados:
--   - oc_cliente   → la OC original que mandó el cliente (pdf, eml, jpg)
--   - pliego       → pliego de condiciones del cliente
--   - especificaciones → fichas técnicas / requisitos especiales
--   - plano        → planos / diagramas técnicos
--   - foto         → fotos de referencia (producto, instalación)
--   - email        → emails forwardeados con info relevante
--   - otro         → cualquier otro archivo
--
-- Almacenamiento: Supabase Storage en bucket "document-attachments"
-- O link externo (Google Drive, Dropbox, OneDrive) si el archivo es muy grande.
-- =====================================================

CREATE TABLE IF NOT EXISTS tt_document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencia genérica al documento dueño
  document_id UUID NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'quote', 'sales_order', 'delivery_note', 'invoice', 'credit_note',
    'purchase_order', 'purchase_invoice', 'client_po',
    'opportunity', 'lead', 'sat_ticket', 'process_instance', 'workflow_node'
  )),

  -- Categoría — para que el sistema pueda destacar la OC con un botón especial
  category TEXT NOT NULL DEFAULT 'otro' CHECK (category IN (
    'oc_cliente', 'pliego', 'especificaciones', 'plano',
    'foto', 'email', 'firma', 'otro'
  )),

  -- Metadata del archivo
  name TEXT NOT NULL,
  description TEXT,
  mime_type TEXT,
  size_bytes BIGINT,

  -- Forma de acceso: o storage_path (sube al bucket) o external_url (link)
  storage_path TEXT,
  external_url TEXT,

  -- Auditoría
  uploaded_by_user_id UUID REFERENCES tt_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Tiene que tener AL MENOS uno de los dos: archivo subido o link externo
  CONSTRAINT attachment_has_source CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_doc_attachments_doc ON tt_document_attachments(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_doc_attachments_category ON tt_document_attachments(category);

COMMENT ON TABLE tt_document_attachments IS 'Adjuntos categorizados por documento — OC originales, pliegos, planos, etc.';
COMMENT ON COLUMN tt_document_attachments.category IS 'oc_cliente destaca con botón "Ver OC original" en la cotización';

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE tt_document_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_attachments_all_authenticated" ON tt_document_attachments;
CREATE POLICY "doc_attachments_all_authenticated"
  ON tt_document_attachments FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- STORAGE BUCKET
-- =====================================================
-- Bucket público (signed URLs) para los adjuntos subidos.
-- Si no existe, lo creamos. Si existe, no falla.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-attachments',
  'document-attachments',
  false,
  52428800, -- 50 MB
  NULL      -- todos los mime types permitidos
)
ON CONFLICT (id) DO NOTHING;

-- Policy: cualquier usuario autenticado puede leer/escribir/borrar adjuntos
DROP POLICY IF EXISTS "Authenticated can read attachments" ON storage.objects;
CREATE POLICY "Authenticated can read attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'document-attachments');

DROP POLICY IF EXISTS "Authenticated can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'document-attachments');

DROP POLICY IF EXISTS "Authenticated can delete attachments" ON storage.objects;
CREATE POLICY "Authenticated can delete attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'document-attachments');
