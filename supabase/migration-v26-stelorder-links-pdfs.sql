-- =====================================================
-- Migration v26: Links + PDFs de StelOrder
-- =====================================================
-- 1) Campos para relaciones cruzadas de StelOrder
-- 2) Referencia a OC del cliente (title de albaranes)
-- 3) URL del PDF original descargado
-- 4) Flag para packing list
-- =====================================================

ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS parent_stelorder_id BIGINT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS client_po_reference TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS stelorder_pdf_url TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS stelorder_pdf_original_url TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS is_packing_list BOOLEAN DEFAULT false;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS stelorder_reference TEXT;  -- full-reference (NRV00025, etc)

CREATE INDEX IF NOT EXISTS idx_docs_parent_stelorder ON tt_documents(parent_stelorder_id) WHERE parent_stelorder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docs_client_po ON tt_documents(client_po_reference) WHERE client_po_reference IS NOT NULL;

-- También en tt_quotes / tt_sales_orders (por si migramos a esas tablas también)
ALTER TABLE tt_quotes          ADD COLUMN IF NOT EXISTS stelorder_pdf_url TEXT;
ALTER TABLE tt_sales_orders    ADD COLUMN IF NOT EXISTS stelorder_pdf_url TEXT;
ALTER TABLE tt_purchase_orders ADD COLUMN IF NOT EXISTS stelorder_pdf_url TEXT;

-- Bucket de PDFs de StelOrder
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('stelorder-pdfs', 'stelorder-pdfs', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "stel_pdfs_auth_read" ON storage.objects;
CREATE POLICY "stel_pdfs_auth_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'stelorder-pdfs');
DROP POLICY IF EXISTS "stel_pdfs_auth_write" ON storage.objects;
CREATE POLICY "stel_pdfs_auth_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'stelorder-pdfs');
DROP POLICY IF EXISTS "stel_pdfs_auth_update" ON storage.objects;
CREATE POLICY "stel_pdfs_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'stelorder-pdfs');

NOTIFY pgrst, 'reload schema';
