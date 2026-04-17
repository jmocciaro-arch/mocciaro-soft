-- =====================================================
-- Migration v17: Sistema de facturación multi-proveedor
-- =====================================================
-- Soporta:
--   1) API Tango (Argentina - BuscaTools SA, Torquear SA)
--   2) Upload manual PDF + parseo con IA (Argentina alternativa)
--   3) Facturación externa (España - TorqueTools SL, USA - Global Assembly LLC)
-- =====================================================

-- 1) Proveedores de facturación configurados por empresa
CREATE TABLE IF NOT EXISTS tt_invoice_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN (
    'tango_api',      -- API Tango (Argentina)
    'manual_upload',  -- Upload manual PDF con parseo IA
    'external'        -- Facturado externamente (España/USA)
  )),
  name TEXT NOT NULL,              -- "Tango Producción", "Facturación España", etc
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',        -- credenciales api, config, etc (encripted or env-ref)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_providers_company ON tt_invoice_providers(company_id);
CREATE INDEX IF NOT EXISTS idx_invoice_providers_default ON tt_invoice_providers(company_id, is_default) WHERE is_default = true;

-- 2) Extender tt_documents con campos de facturación
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS invoice_method TEXT
  CHECK (invoice_method IN ('tango_api','manual_upload','external'));
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES tt_invoice_providers(id);
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS original_pdf_url TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS preview_pdf_url TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}';
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS cae TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS cae_expires DATE;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS tango_invoice_id TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS afip_response JSONB;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS invoice_total NUMERIC;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS invoice_currency TEXT DEFAULT 'ARS';

CREATE INDEX IF NOT EXISTS idx_documents_invoice_method ON tt_documents(invoice_method);
CREATE INDEX IF NOT EXISTS idx_documents_cae ON tt_documents(cae) WHERE cae IS NOT NULL;

-- 3) RLS policies
ALTER TABLE tt_invoice_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_providers_all_authenticated" ON tt_invoice_providers;
CREATE POLICY "invoice_providers_all_authenticated" ON tt_invoice_providers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Storage bucket para PDFs de facturas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  20971520, -- 20MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg'];

-- Storage policies
DROP POLICY IF EXISTS "invoices_auth_read" ON storage.objects;
CREATE POLICY "invoices_auth_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "invoices_auth_write" ON storage.objects;
CREATE POLICY "invoices_auth_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoices');

DROP POLICY IF EXISTS "invoices_auth_update" ON storage.objects;
CREATE POLICY "invoices_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "invoices_auth_delete" ON storage.objects;
CREATE POLICY "invoices_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'invoices');

-- 5) Seed: defaults por empresa (se puede ajustar luego)
INSERT INTO tt_invoice_providers (company_id, provider_type, name, is_default, is_active)
SELECT id, 'manual_upload', 'Upload Manual PDF', true, true
FROM tt_companies
WHERE country IN ('AR', 'Argentina')
ON CONFLICT DO NOTHING;

INSERT INTO tt_invoice_providers (company_id, provider_type, name, is_default, is_active)
SELECT id, 'external', 'Facturación externa', true, true
FROM tt_companies
WHERE country NOT IN ('AR', 'Argentina') OR country IS NULL
ON CONFLICT DO NOTHING;

-- =====================================================
-- FIN migration v17
-- =====================================================
