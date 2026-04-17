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
-- =====================================================
-- Migration v18: Configuración Tango Factura por empresa
-- =====================================================
-- Extiende tt_invoice_providers para guardar credenciales Tango
-- (UserIdentifier, ApplicationPublicKey, PerfilComprobanteID)
-- =====================================================

-- Agregar helpers para cachear datos maestros Tango
CREATE TABLE IF NOT EXISTS tt_tango_maestros_cache (
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,          -- alicuotas | monedas | puntos_venta | perfiles | categorias_impositivas | tipos_documento
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, tipo)
);

-- Vincular clientes ERP con Tango
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS tango_cliente_codigo TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS tango_cliente_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_clients_tango_codigo ON tt_clients(tango_cliente_codigo);

-- Vincular productos ERP con Tango
ALTER TABLE tt_products ADD COLUMN IF NOT EXISTS tango_producto_codigo TEXT;
CREATE INDEX IF NOT EXISTS idx_products_tango_codigo ON tt_products(tango_producto_codigo);

-- Campo en tt_documents para el ID del movimiento en Tango
-- (ya existe tango_invoice_id en v17, agregamos autorizado_at)
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS tango_autorizado_at TIMESTAMPTZ;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS tango_movimiento_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_documents_tango_mov ON tt_documents(tango_movimiento_id);

-- RLS en cache
ALTER TABLE tt_tango_maestros_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tango_cache_all_authenticated" ON tt_tango_maestros_cache;
CREATE POLICY "tango_cache_all_authenticated" ON tt_tango_maestros_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- NOTA: Las credenciales se guardan en tt_invoice_providers.config (JSONB):
-- {
--   "user_identifier": "...",
--   "application_public_key": "...",
--   "perfil_comprobante_id": 1234,
--   "punto_venta_default": 1
-- }
-- =====================================================
-- =====================================================
-- Migration v19: CRM Leads + Conciliación bancaria + IA
-- =====================================================
-- Agrega:
--   1) tt_leads          — leads del CRM con scoring IA
--   2) tt_bank_statements — extractos bancarios
--   3) tt_bank_statement_lines — líneas con matching a facturas
--   4) Extiende tt_clients con ia_fields (cache de análisis)
-- =====================================================

-- 1) LEADS con scoring IA
CREATE TABLE IF NOT EXISTS tt_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,                      -- web_form, whatsapp, email, llamada, referido, etc
  source_ref TEXT,                  -- ID externo de donde vino
  industry TEXT,                    -- sector del lead
  company_name TEXT,
  estimated_value NUMERIC,
  currency TEXT DEFAULT 'ARS',
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new','contacted','qualified','proposal_sent','negotiation','won','lost','nurturing'
  )),
  assigned_to UUID REFERENCES tt_users(id),
  notes TEXT,
  raw_message TEXT,                 -- mensaje original del lead (mail/whatsapp/formulario)
  -- Campos IA
  ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100),   -- 0-100
  ai_temperature TEXT CHECK (ai_temperature IN ('hot','warm','cold')),
  ai_tags TEXT[],                   -- ['enterprise', 'price-sensitive', 'urgente']
  ai_suggested_action TEXT,
  ai_suggested_email TEXT,          -- email draft sugerido
  ai_needs JSONB DEFAULT '{}',      -- {productos:[...], presupuesto_estimado:N, urgencia:'alta'}
  ai_analysis_at TIMESTAMPTZ,
  ai_provider TEXT,                 -- gemini | claude
  -- Conversión
  converted_client_id UUID REFERENCES tt_clients(id),
  converted_quote_id UUID REFERENCES tt_documents(id),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_company ON tt_leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON tt_leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON tt_leads(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON tt_leads(assigned_to);

-- 2) Interacciones con leads (timeline)
CREATE TABLE IF NOT EXISTS tt_lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES tt_leads(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,               -- email, call, meeting, whatsapp, note
  direction TEXT,                   -- inbound | outbound
  subject TEXT,
  body TEXT,
  ai_summary TEXT,                  -- resumen IA de la interacción
  ai_next_steps TEXT,
  attachments JSONB DEFAULT '[]',
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead ON tt_lead_interactions(lead_id);

-- 3) Extractos bancarios
CREATE TABLE IF NOT EXISTS tt_bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  currency TEXT DEFAULT 'ARS',
  period_from DATE,
  period_to DATE,
  opening_balance NUMERIC,
  closing_balance NUMERIC,
  original_pdf_url TEXT,
  parsed_at TIMESTAMPTZ,
  parsed_by TEXT,                   -- 'gemini' | 'claude' | 'manual'
  lines_count INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  raw_data JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','parsed','reconciled','archived')),
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_statements_company ON tt_bank_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON tt_bank_statements(status);

-- 4) Líneas del extracto (cada movimiento)
CREATE TABLE IF NOT EXISTS tt_bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID REFERENCES tt_bank_statements(id) ON DELETE CASCADE NOT NULL,
  line_number INTEGER,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,                   -- Nº de comprobante, CBU, etc
  amount NUMERIC NOT NULL,          -- positivo=crédito, negativo=débito
  balance NUMERIC,
  type TEXT CHECK (type IN ('credit','debit','fee','interest','other')),
  -- Matching
  matched_document_id UUID REFERENCES tt_documents(id),
  matched_client_id UUID REFERENCES tt_clients(id),
  match_confidence NUMERIC(3,2),    -- 0.0-1.0
  match_method TEXT,                -- amount_exact, cuit_match, reference_match, ai_suggested
  match_reason TEXT,                -- explicación IA
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN (
    'unmatched','suggested','confirmed','rejected','ignored'
  )),
  confirmed_by UUID REFERENCES tt_users(id),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bank_lines_statement ON tt_bank_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_lines_match_status ON tt_bank_statement_lines(match_status);
CREATE INDEX IF NOT EXISTS idx_bank_lines_doc ON tt_bank_statement_lines(matched_document_id);

-- 5) Extender tt_oc_parsed con campos IA
ALTER TABLE tt_oc_parsed ADD COLUMN IF NOT EXISTS ai_provider TEXT;
ALTER TABLE tt_oc_parsed ADD COLUMN IF NOT EXISTS ai_discrepancies JSONB DEFAULT '[]';
ALTER TABLE tt_oc_parsed ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE tt_oc_parsed ADD COLUMN IF NOT EXISTS matched_quote_id UUID REFERENCES tt_documents(id);

-- 6) Extender tt_clients con análisis IA cacheado
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS ai_profile JSONB DEFAULT '{}';
-- ai_profile: {segment, lifetime_value, avg_payment_days, preferred_products, last_ai_at}

-- 7) RLS
ALTER TABLE tt_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_bank_statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_all_authenticated" ON tt_leads;
CREATE POLICY "leads_all_authenticated" ON tt_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lead_inter_all_authenticated" ON tt_lead_interactions;
CREATE POLICY "lead_inter_all_authenticated" ON tt_lead_interactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bank_stmt_all_authenticated" ON tt_bank_statements;
CREATE POLICY "bank_stmt_all_authenticated" ON tt_bank_statements FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bank_lines_all_authenticated" ON tt_bank_statement_lines;
CREATE POLICY "bank_lines_all_authenticated" ON tt_bank_statement_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8) Storage bucket para extractos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bank-statements', 'bank-statements', false, 20971520, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/csv'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/csv'];

DROP POLICY IF EXISTS "bank_stmt_auth_read" ON storage.objects;
CREATE POLICY "bank_stmt_auth_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bank-statements');
DROP POLICY IF EXISTS "bank_stmt_auth_write" ON storage.objects;
CREATE POLICY "bank_stmt_auth_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bank-statements');
DROP POLICY IF EXISTS "bank_stmt_auth_update" ON storage.objects;
CREATE POLICY "bank_stmt_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'bank-statements');

-- Storage bucket para OCs de clientes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('client-pos', 'client-pos', false, 20971520, ARRAY['application/pdf', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg'];

DROP POLICY IF EXISTS "client_pos_auth_read" ON storage.objects;
CREATE POLICY "client_pos_auth_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'client-pos');
DROP POLICY IF EXISTS "client_pos_auth_write" ON storage.objects;
CREATE POLICY "client_pos_auth_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-pos');
-- =====================================================
-- Migration v20: Prefijos por empresa + numeración de documentos
-- =====================================================
-- Agrega:
--   1) tt_companies.code_prefix (2 letras)
--   2) tt_companies.trade_name (nombre fantasía)
--   3) tt_companies.legal_name (razón social)
--   4) tt_companies.tax_id (CUIT/NIF/EIN)
--   5) Secuencia por empresa+tipo para nº correlativo
--   6) Función next_document_code() para generar "COTI-TT-0042"
--   7) Trigger opcional para auto-asignar system_code si viene vacío
-- =====================================================

-- 1) Campos fiscales en empresas
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS code_prefix TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS tax_id_type TEXT;  -- 'CUIT'|'NIF'|'EIN'

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code_prefix ON tt_companies(code_prefix) WHERE code_prefix IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_tax_id ON tt_companies(tax_id);

-- 2) Seed prefijos/identidad para las 4 empresas conocidas
-- (solo si el nombre matchea y aún no tienen prefix)
UPDATE tt_companies SET
  code_prefix = 'TT',
  trade_name = COALESCE(trade_name, 'Torquetools'),
  legal_name = COALESCE(legal_name, 'Torquetools SL'),
  tax_id_type = 'NIF'
WHERE (name ILIKE '%torquetools%' OR name ILIKE '%torque tools%')
  AND (country ILIKE '%spain%' OR country = 'ES' OR country ILIKE '%españa%')
  AND code_prefix IS NULL;

UPDATE tt_companies SET
  code_prefix = 'BS',
  trade_name = COALESCE(trade_name, 'Buscatools'),
  legal_name = COALESCE(legal_name, 'Mocciaro Juan Manuel Jesus'),
  tax_id = COALESCE(tax_id, '20-27089205-2'),
  tax_id_type = 'CUIT'
WHERE name ILIKE '%buscatools%'
  AND code_prefix IS NULL;

UPDATE tt_companies SET
  code_prefix = 'TQ',
  trade_name = COALESCE(trade_name, 'Torquear'),
  legal_name = COALESCE(legal_name, 'Torquear SA'),
  tax_id = COALESCE(tax_id, '33-71159029-9'),
  tax_id_type = 'CUIT'
WHERE name ILIKE '%torquear%'
  AND code_prefix IS NULL;

UPDATE tt_companies SET
  code_prefix = 'GA',
  trade_name = COALESCE(trade_name, 'Global Assembly'),
  legal_name = COALESCE(legal_name, 'Global Assembly Solutions LLC'),
  tax_id_type = 'EIN'
WHERE name ILIKE '%global assembly%'
  AND code_prefix IS NULL;

-- 3) Secuencia por empresa+tipo (persiste en tabla)
CREATE TABLE IF NOT EXISTS tt_document_sequences (
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, doc_type)
);

-- 4) Mapeo type → prefijo de tipo
-- cotizacion     → COTI
-- orden_compra   → OC
-- pedido         → PED
-- albaran/remito → REM (AR) | ALB (ES)
-- factura        → FAC
-- nota_credito   → NC
-- nota_debito    → ND
-- recibo         → REC

-- 5) Función para generar el próximo código: "COTI-TT-0042"
CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN
    v_prefix := 'XX';
  END IF;

  v_type_code := CASE lower(p_type)
    WHEN 'cotizacion' THEN 'COTI'
    WHEN 'orden_compra' THEN 'OC'
    WHEN 'pedido' THEN 'PED'
    WHEN 'albaran' THEN 'ALB'
    WHEN 'remito' THEN 'REM'
    WHEN 'factura' THEN 'FAC'
    WHEN 'nota_credito' THEN 'NC'
    WHEN 'nota_debito' THEN 'ND'
    WHEN 'recibo' THEN 'REC'
    WHEN 'presupuesto' THEN 'PRE'
    ELSE upper(p_type)
  END;

  INSERT INTO tt_document_sequences (company_id, doc_type, last_number)
  VALUES (p_company_id, p_type, 1)
  ON CONFLICT (company_id, doc_type) DO UPDATE
  SET last_number = tt_document_sequences.last_number + 1,
      updated_at = NOW()
  RETURNING last_number INTO v_num;

  RETURN v_type_code || '-' || v_prefix || '-' || lpad(v_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 6) Trigger opcional: si system_code viene vacío, auto-generar
CREATE OR REPLACE FUNCTION tt_documents_auto_system_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.system_code IS NULL OR NEW.system_code = '' THEN
    NEW.system_code := next_document_code(NEW.company_id, NEW.type);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_documents_auto_code ON tt_documents;
CREATE TRIGGER trg_tt_documents_auto_code
  BEFORE INSERT ON tt_documents
  FOR EACH ROW EXECUTE FUNCTION tt_documents_auto_system_code();

-- 7) Mismo tratamiento para tt_leads (prefijo LEAD-TT-0001)
ALTER TABLE tt_leads ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

CREATE OR REPLACE FUNCTION tt_leads_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := next_document_code(NEW.company_id, 'lead');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_leads_auto_code ON tt_leads;
CREATE TRIGGER trg_tt_leads_auto_code
  BEFORE INSERT ON tt_leads
  FOR EACH ROW EXECUTE FUNCTION tt_leads_auto_code();

-- Extender función para soportar 'lead'
CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'XX'; END IF;

  v_type_code := CASE lower(p_type)
    WHEN 'cotizacion' THEN 'COTI'
    WHEN 'orden_compra' THEN 'OC'
    WHEN 'pedido' THEN 'PED'
    WHEN 'albaran' THEN 'ALB'
    WHEN 'remito' THEN 'REM'
    WHEN 'factura' THEN 'FAC'
    WHEN 'nota_credito' THEN 'NC'
    WHEN 'nota_debito' THEN 'ND'
    WHEN 'recibo' THEN 'REC'
    WHEN 'presupuesto' THEN 'PRE'
    WHEN 'lead' THEN 'LEAD'
    ELSE upper(p_type)
  END;

  INSERT INTO tt_document_sequences (company_id, doc_type, last_number)
  VALUES (p_company_id, p_type, 1)
  ON CONFLICT (company_id, doc_type) DO UPDATE
  SET last_number = tt_document_sequences.last_number + 1,
      updated_at = NOW()
  RETURNING last_number INTO v_num;

  RETURN v_type_code || '-' || v_prefix || '-' || lpad(v_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;
-- =====================================================
-- Migration v21: Fix tt_opportunities - columnas faltantes
-- =====================================================
-- El schema.sql tiene estas columnas pero la DB real las perdió
-- (probablemente por recreación parcial). Las agregamos si faltan.
-- =====================================================

ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES tt_users(id);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 10;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS expected_close_date DATE;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES tt_quotes(id);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS notes TEXT;

-- El CRM viejo maneja también estos campos:
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS product_interest TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS urgency TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS next_action_date DATE;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS next_action_type TEXT;

-- Extender con campos IA (mismo enfoque que tt_leads)
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_temperature TEXT CHECK (ai_temperature IN ('hot','warm','cold'));
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_tags TEXT[];
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_action TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_email TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_needs JSONB DEFAULT '{}';
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMPTZ;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_provider TEXT;

-- Agregar código de oportunidad con prefijo de empresa (OPP-TT-0001)
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

CREATE OR REPLACE FUNCTION tt_opportunities_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := next_document_code(NEW.company_id, 'oportunidad');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_opportunities_auto_code ON tt_opportunities;
CREATE TRIGGER trg_tt_opportunities_auto_code
  BEFORE INSERT ON tt_opportunities
  FOR EACH ROW EXECUTE FUNCTION tt_opportunities_auto_code();

-- Actualizar next_document_code para incluir 'oportunidad' → OPP
CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'XX'; END IF;

  v_type_code := CASE lower(p_type)
    WHEN 'cotizacion' THEN 'COTI'
    WHEN 'orden_compra' THEN 'OC'
    WHEN 'pedido' THEN 'PED'
    WHEN 'albaran' THEN 'ALB'
    WHEN 'remito' THEN 'REM'
    WHEN 'factura' THEN 'FAC'
    WHEN 'nota_credito' THEN 'NC'
    WHEN 'nota_debito' THEN 'ND'
    WHEN 'recibo' THEN 'REC'
    WHEN 'presupuesto' THEN 'PRE'
    WHEN 'lead' THEN 'LEAD'
    WHEN 'oportunidad' THEN 'OPP'
    ELSE upper(p_type)
  END;

  INSERT INTO tt_document_sequences (company_id, doc_type, last_number)
  VALUES (p_company_id, p_type, 1)
  ON CONFLICT (company_id, doc_type) DO UPDATE
  SET last_number = tt_document_sequences.last_number + 1,
      updated_at = NOW()
  RETURNING last_number INTO v_num;

  RETURN v_type_code || '-' || v_prefix || '-' || lpad(v_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Reload schema cache de PostgREST (para que aparezcan las nuevas columnas ya)
NOTIFY pgrst, 'reload schema';
-- =====================================================
-- Migration v22: Unificar auto-códigos con prefijo de empresa
-- en TODA la cadena de ventas
-- =====================================================
-- Agrega trigger tt_<table>_auto_code a: tt_quotes, tt_sales_orders,
-- tt_purchase_orders. Para que quote_number, so_number, po_number
-- se generen automáticamente como COTI-TT-0001, PED-TT-0001, etc
-- si vienen vacíos.
-- =====================================================

-- tt_quotes (cotizaciones)
CREATE OR REPLACE FUNCTION tt_quotes_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := next_document_code(NEW.company_id, 'cotizacion');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_quotes_auto_number ON tt_quotes;
CREATE TRIGGER trg_tt_quotes_auto_number
  BEFORE INSERT ON tt_quotes
  FOR EACH ROW EXECUTE FUNCTION tt_quotes_auto_number();

-- tt_sales_orders (pedidos de venta)
CREATE OR REPLACE FUNCTION tt_sales_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.so_number IS NULL OR NEW.so_number = '' THEN
    NEW.so_number := next_document_code(NEW.company_id, 'pedido');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_sales_orders_auto_number ON tt_sales_orders;
CREATE TRIGGER trg_tt_sales_orders_auto_number
  BEFORE INSERT ON tt_sales_orders
  FOR EACH ROW EXECUTE FUNCTION tt_sales_orders_auto_number();

-- tt_purchase_orders (órdenes de compra a proveedores)
CREATE OR REPLACE FUNCTION tt_purchase_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := next_document_code(NEW.company_id, 'orden_compra');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_purchase_orders_auto_number ON tt_purchase_orders;
CREATE TRIGGER trg_tt_purchase_orders_auto_number
  BEFORE INSERT ON tt_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION tt_purchase_orders_auto_number();

-- =====================================================
-- IA sobre tt_opportunities — reutiliza /api/leads/score
-- =====================================================
-- Las columnas IA ya se agregaron en v21. Acá aseguramos que están.
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_score INTEGER;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_temperature TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_tags TEXT[];
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_action TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_email TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_needs JSONB DEFAULT '{}';
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMPTZ;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_provider TEXT;

-- Vinculación Lead ↔ Opportunity ↔ Quote (cadena de conversión)
ALTER TABLE tt_leads ADD COLUMN IF NOT EXISTS converted_opportunity_id UUID REFERENCES tt_opportunities(id);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES tt_leads(id);

CREATE INDEX IF NOT EXISTS idx_opp_lead ON tt_opportunities(source_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_opp ON tt_leads(converted_opportunity_id);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
-- =====================================================
-- Migration v23: Condición de pago en cotizaciones
-- =====================================================
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_days INTEGER;
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_terms_type TEXT
  CHECK (payment_terms_type IN ('contado','anticipado','dias_ff','dias_fv','dias_fr','custom'));

-- Mismos campos en pedidos y facturas (para que fluyan en la cadena)
ALTER TABLE tt_sales_orders ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE tt_sales_orders ADD COLUMN IF NOT EXISTS payment_days INTEGER;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS payment_days INTEGER;
-- payment_terms ya existe en tt_documents

NOTIFY pgrst, 'reload schema';
-- =====================================================
-- Migration v24: Robustecer triggers de auto-code
-- =====================================================
-- Si viene NULL como company_id o tipo no mapeado, NO rompemos el INSERT,
-- simplemente dejamos el code en NULL (se puede asignar después).
-- =====================================================

CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  -- Si no viene company_id, no generamos code (retornamos NULL)
  IF p_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'XX'; END IF;

  v_type_code := CASE lower(p_type)
    WHEN 'cotizacion' THEN 'COTI'
    WHEN 'orden_compra' THEN 'OC'
    WHEN 'pedido' THEN 'PED'
    WHEN 'albaran' THEN 'ALB'
    WHEN 'remito' THEN 'REM'
    WHEN 'factura' THEN 'FAC'
    WHEN 'nota_credito' THEN 'NC'
    WHEN 'nota_debito' THEN 'ND'
    WHEN 'recibo' THEN 'REC'
    WHEN 'presupuesto' THEN 'PRE'
    WHEN 'lead' THEN 'LEAD'
    WHEN 'oportunidad' THEN 'OPP'
    ELSE upper(p_type)
  END;

  INSERT INTO tt_document_sequences (company_id, doc_type, last_number)
  VALUES (p_company_id, p_type, 1)
  ON CONFLICT (company_id, doc_type) DO UPDATE
  SET last_number = tt_document_sequences.last_number + 1,
      updated_at = NOW()
  RETURNING last_number INTO v_num;

  RETURN v_type_code || '-' || v_prefix || '-' || lpad(v_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Hacer TODOS los triggers tolerantes a errores: si falla la generación, no rompen el INSERT
CREATE OR REPLACE FUNCTION tt_opportunities_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.code IS NULL OR NEW.code = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.code := next_document_code(NEW.company_id, 'oportunidad');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error generando code para oportunidad: %', SQLERRM;
      NEW.code := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_leads_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.code IS NULL OR NEW.code = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.code := next_document_code(NEW.company_id, 'lead');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error generando code para lead: %', SQLERRM;
      NEW.code := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_documents_auto_system_code()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.system_code IS NULL OR NEW.system_code = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.system_code := next_document_code(NEW.company_id, NEW.type);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error generando system_code: %', SQLERRM;
      -- Fallback: usar timestamp
      NEW.system_code := 'DOC-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_quotes_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.quote_number IS NULL OR NEW.quote_number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.quote_number := next_document_code(NEW.company_id, 'cotizacion');
    EXCEPTION WHEN OTHERS THEN
      NEW.quote_number := 'COTI-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_sales_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.so_number IS NULL OR NEW.so_number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.so_number := next_document_code(NEW.company_id, 'pedido');
    EXCEPTION WHEN OTHERS THEN
      NEW.so_number := 'PED-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_purchase_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.po_number IS NULL OR NEW.po_number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.po_number := next_document_code(NEW.company_id, 'orden_compra');
    EXCEPTION WHEN OTHERS THEN
      NEW.po_number := 'OC-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
-- =====================================================
-- Migration v25: Soporte para migración desde StelOrder
-- =====================================================
-- 1) Tabla de log de migración (checkpoint + auditoria)
-- 2) Columna stelorder_id en todas las tablas migrables
-- 3) Función helper para upsert por stelorder_id
-- =====================================================

-- 1) Log de migración
CREATE TABLE IF NOT EXISTS tt_migration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'stelorder',
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  phase TEXT NOT NULL,              -- "1a_rates", "2c_clients", etc
  entity TEXT NOT NULL,             -- "clients", "products", etc
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  total_source INTEGER,             -- cantidad en StelOrder
  processed INTEGER DEFAULT 0,
  inserted INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]',
  last_cursor TEXT,                 -- para resumability (fecha, ID, etc)
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_migration_log_company ON tt_migration_log(company_id);
CREATE INDEX IF NOT EXISTS idx_migration_log_status ON tt_migration_log(status);
CREATE INDEX IF NOT EXISTS idx_migration_log_phase ON tt_migration_log(phase);

-- 2) Columnas stelorder_id en TODAS las tablas migrables
ALTER TABLE tt_clients         ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_suppliers       ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_products        ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_quotes          ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_sales_orders    ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_purchase_orders ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_documents       ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_leads           ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_warehouses      ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;
ALTER TABLE tt_sat_tickets     ADD COLUMN IF NOT EXISTS stelorder_id BIGINT;

-- Indices unicos parciales (permiten upsert por stelorder_id pero sin forzar NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_stelorder   ON tt_clients(stelorder_id)         WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_stelorder ON tt_suppliers(stelorder_id)       WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_stelorder  ON tt_products(stelorder_id)        WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_stelorder  ON tt_client_contacts(stelorder_id) WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_stelorder    ON tt_quotes(stelorder_id)          WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_so_stelorder        ON tt_sales_orders(stelorder_id)    WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_stelorder        ON tt_purchase_orders(stelorder_id) WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_stelorder      ON tt_documents(stelorder_id)       WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_stelorder     ON tt_leads(stelorder_id)           WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wh_stelorder        ON tt_warehouses(stelorder_id)      WHERE stelorder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sat_stelorder       ON tt_sat_tickets(stelorder_id)     WHERE stelorder_id IS NOT NULL;

-- 3) Marcador en la empresa
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS migrated_from_stelorder BOOLEAN DEFAULT false;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS stelorder_apikey_configured BOOLEAN DEFAULT false;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS migration_stats JSONB DEFAULT '{}';

-- 4) RLS
ALTER TABLE tt_migration_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "migration_log_auth" ON tt_migration_log;
CREATE POLICY "migration_log_auth" ON tt_migration_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
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
-- =====================================================
-- Migration v27: Formato de código con año — COT-TT2026-0004
-- =====================================================
-- Cambio de formato:
--   ANTES: COT-TT-0001  (tipo - empresa - número)
--   AHORA: COT-TT2026-0004  (tipo - empresaAÑO - número)
-- La numeración se reinicia por año (secuencia por company+type+year).
-- =====================================================

-- 1) Agregar columna year a la secuencia
ALTER TABLE tt_document_sequences ADD COLUMN IF NOT EXISTS year INTEGER;

-- Si tenía registros sin year, los marcamos como año actual
UPDATE tt_document_sequences SET year = EXTRACT(YEAR FROM NOW())::INT WHERE year IS NULL;

-- Rehacer la PK para incluir year
ALTER TABLE tt_document_sequences DROP CONSTRAINT IF EXISTS tt_document_sequences_pkey;
ALTER TABLE tt_document_sequences ADD PRIMARY KEY (company_id, doc_type, year);

-- 2) Función actualizada: COT-TT2026-0004
CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INT;
BEGIN
  IF p_company_id IS NULL THEN RETURN NULL; END IF;

  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'XX'; END IF;

  v_type_code := CASE lower(p_type)
    WHEN 'cotizacion' THEN 'COT'
    WHEN 'orden_compra' THEN 'OC'
    WHEN 'pedido' THEN 'PED'
    WHEN 'albaran' THEN 'ALB'
    WHEN 'remito' THEN 'REM'
    WHEN 'packing_list' THEN 'PCK'
    WHEN 'factura' THEN 'FAC'
    WHEN 'factura_compra' THEN 'FCP'
    WHEN 'albaran_compra' THEN 'ALC'
    WHEN 'nota_credito' THEN 'NC'
    WHEN 'nota_debito' THEN 'ND'
    WHEN 'recibo' THEN 'REC'
    WHEN 'gasto' THEN 'GAS'
    WHEN 'presupuesto' THEN 'PRE'
    WHEN 'lead' THEN 'LEAD'
    WHEN 'oportunidad' THEN 'OPP'
    ELSE upper(p_type)
  END;

  INSERT INTO tt_document_sequences (company_id, doc_type, year, last_number)
  VALUES (p_company_id, p_type, v_year, 1)
  ON CONFLICT (company_id, doc_type, year) DO UPDATE
  SET last_number = tt_document_sequences.last_number + 1,
      updated_at = NOW()
  RETURNING last_number INTO v_num;

  -- Formato: COT-TT2026-0004
  RETURN v_type_code || '-' || v_prefix || v_year::text || '-' || lpad(v_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- NOTA: Los documentos ya migrados de StelOrder mantienen su
-- legal_number original (ej "FAC00001", "NRV00025"). El nuevo
-- formato solo se aplica a documentos creados desde Mocciaro Soft.
-- =====================================================
-- =====================================================
-- Migration v28: Alertas automáticas + Daily Digest
-- =====================================================

-- 1) Configuración de alertas por empresa
CREATE TABLE IF NOT EXISTS tt_alert_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES tt_users(id),
  -- Qué alertas recibir
  invoice_due_days INTEGER[] DEFAULT ARRAY[7, 3, 1, 0],  -- avisos a 7d, 3d, 1d, hoy
  quote_expiry_days INTEGER[] DEFAULT ARRAY[3, 1],
  lead_cold_days INTEGER DEFAULT 2,                       -- leads hot sin contacto
  stock_min_enabled BOOLEAN DEFAULT true,
  daily_digest_enabled BOOLEAN DEFAULT true,
  daily_digest_hour INTEGER DEFAULT 8,                    -- hora local
  -- Canales
  email_enabled BOOLEAN DEFAULT true,
  email_to TEXT,                                          -- destinatario override
  whatsapp_enabled BOOLEAN DEFAULT false,
  whatsapp_to TEXT,
  push_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

-- 2) Alertas generadas (para no mandar duplicadas)
CREATE TABLE IF NOT EXISTS tt_generated_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  user_id UUID REFERENCES tt_users(id),
  type TEXT NOT NULL,              -- 'invoice_due', 'quote_expiry', 'lead_cold', 'stock_low', 'daily_digest'
  entity_type TEXT,                -- 'document', 'lead', 'product'
  entity_id UUID,
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'danger', 'success')),
  -- Canales
  sent_email BOOLEAN DEFAULT false,
  sent_whatsapp BOOLEAN DEFAULT false,
  sent_push BOOLEAN DEFAULT false,
  -- Estado
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Deduplication key: no mandar la misma alerta para el mismo doc el mismo día
  dedup_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_company ON tt_generated_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON tt_generated_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON tt_generated_alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON tt_generated_alerts(entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_dedup ON tt_generated_alerts(company_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- 3) Log de digests enviados
CREATE TABLE IF NOT EXISTS tt_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  user_id UUID REFERENCES tt_users(id),
  digest_date DATE NOT NULL,
  stats JSONB DEFAULT '{}',       -- { invoices_due, leads_hot, pipeline_value, etc }
  email_sent BOOLEAN DEFAULT false,
  email_to TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, user_id, digest_date)
);

-- 4) RLS
ALTER TABLE tt_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_generated_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_digest_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_settings_auth" ON tt_alert_settings;
CREATE POLICY "alert_settings_auth" ON tt_alert_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "alerts_auth" ON tt_generated_alerts;
CREATE POLICY "alerts_auth" ON tt_generated_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "digest_log_auth" ON tt_digest_log;
CREATE POLICY "digest_log_auth" ON tt_digest_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
-- =====================================================
-- Migration v29: Branding por empresa (PDFs/emails)
-- =====================================================

ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#F97316';
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#1E2330';
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS email_main TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS bank_details TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS footer_note TEXT;

-- Seed defaults para las 4 empresas conocidas
UPDATE tt_companies SET
  brand_color = COALESCE(brand_color, '#F97316'),
  secondary_color = COALESCE(secondary_color, '#1E2330')
WHERE brand_color IS NULL;

NOTIFY pgrst, 'reload schema';
-- =====================================================
-- Migration v30: Cash Flow bajo control
-- FX rates diarios, aging report, forecast snapshots
-- =====================================================

-- 1) Tipos de cambio diarios
CREATE TABLE IF NOT EXISTS tt_fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  target_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  source TEXT,  -- 'dolarapi.com' | 'ecb' | 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, base_currency, target_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON tt_fx_rates(date DESC);
CREATE INDEX IF NOT EXISTS idx_fx_rates_pair ON tt_fx_rates(base_currency, target_currency);

-- 2) Snapshots de forecast para historial
CREATE TABLE IF NOT EXISTS tt_cashflow_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE NOT NULL,
  snapshot_date DATE NOT NULL,
  horizon_days INTEGER NOT NULL DEFAULT 90,  -- 30, 60 o 90
  currency TEXT NOT NULL DEFAULT 'EUR',
  -- Inflows esperados
  inflow_invoices_pending NUMERIC DEFAULT 0,   -- facturas emitidas pendientes de cobro
  inflow_invoices_likely NUMERIC DEFAULT 0,    -- % probabilidad de cobro según historial
  inflow_other NUMERIC DEFAULT 0,
  -- Outflows esperados
  outflow_purchases NUMERIC DEFAULT 0,         -- OC pendientes de pago
  outflow_recurring NUMERIC DEFAULT 0,         -- gastos recurrentes estimados
  outflow_other NUMERIC DEFAULT 0,
  -- Saldo calculado
  net_cashflow NUMERIC DEFAULT 0,
  opening_balance NUMERIC DEFAULT 0,
  projected_closing NUMERIC DEFAULT 0,
  -- Metadata
  data JSONB DEFAULT '{}',                     -- breakdown detallado por semana
  ai_summary TEXT,                             -- resumen IA
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, snapshot_date, horizon_days, currency)
);

CREATE INDEX IF NOT EXISTS idx_cashflow_snapshots_company ON tt_cashflow_snapshots(company_id, snapshot_date DESC);

-- 3) RLS
ALTER TABLE tt_fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_cashflow_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fx_rates_auth" ON tt_fx_rates;
CREATE POLICY "fx_rates_auth" ON tt_fx_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "cashflow_snapshots_auth" ON tt_cashflow_snapshots;
CREATE POLICY "cashflow_snapshots_auth" ON tt_cashflow_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
-- =====================================================
-- Migration v31: Escala tu CRM
-- Email sequences, public forms, client portal, WhatsApp
-- =====================================================

-- 1) Email sequences
CREATE TABLE IF NOT EXISTS tt_email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT CHECK (trigger_type IN ('lead_new','lead_qualified','quote_sent','quote_accepted','order_created','invoice_sent','manual')),
  steps JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tt_email_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_email_sequences_auth" ON tt_email_sequences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_email_sequences_company ON tt_email_sequences(company_id);
CREATE INDEX IF NOT EXISTS idx_email_sequences_active ON tt_email_sequences(is_active);

-- 2) Email sequence enrollments
CREATE TABLE IF NOT EXISTS tt_email_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES tt_email_sequences(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  email TEXT NOT NULL,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','unsubscribed','failed')),
  next_send_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tt_email_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_email_enrollments_auth" ON tt_email_enrollments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_email_enrollments_sequence ON tt_email_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_email_enrollments_status ON tt_email_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_email_enrollments_next_send ON tt_email_enrollments(next_send_at);
CREATE INDEX IF NOT EXISTS idx_email_enrollments_entity ON tt_email_enrollments(entity_type, entity_id);

-- 3) Email send log
CREATE TABLE IF NOT EXISTS tt_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES tt_email_enrollments(id),
  company_id UUID REFERENCES tt_companies(id),
  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  channel TEXT DEFAULT 'email',
  status TEXT DEFAULT 'sent',
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tt_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_email_log_auth" ON tt_email_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_email_log_company ON tt_email_log(company_id);
CREATE INDEX IF NOT EXISTS idx_email_log_enrollment ON tt_email_log(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON tt_email_log(sent_at DESC);

-- 4) Public form configs
CREATE TABLE IF NOT EXISTS tt_public_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  fields JSONB NOT NULL DEFAULT '[]',
  redirect_url TEXT,
  auto_score BOOLEAN DEFAULT true,
  auto_sequence_id UUID REFERENCES tt_email_sequences(id),
  is_active BOOLEAN DEFAULT true,
  submissions_count INTEGER DEFAULT 0,
  theme JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tt_public_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_public_forms_auth" ON tt_public_forms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Allow anon read for active forms (needed by public form page)
CREATE POLICY "tt_public_forms_anon_read" ON tt_public_forms
  FOR SELECT TO anon USING (is_active = true);

CREATE INDEX IF NOT EXISTS idx_public_forms_company ON tt_public_forms(company_id);
CREATE INDEX IF NOT EXISTS idx_public_forms_slug ON tt_public_forms(slug);

-- 5) Client portal access tokens
CREATE TABLE IF NOT EXISTS tt_client_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES tt_clients(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tt_client_portal_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_client_portal_tokens_auth" ON tt_client_portal_tokens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON tt_client_portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_client ON tt_client_portal_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_company ON tt_client_portal_tokens(company_id);

-- 6) WhatsApp config per company
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS whatsapp_phone_id TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS whatsapp_token TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
-- ============================================================
-- MIGRATION V32 — IA Avanzada: Voice SAT, OCR Receipts, Agent, Daily Summary
-- ============================================================

-- 1) TABLA: tt_agent_tasks — Tareas del agente autónomo
-- ============================================================

CREATE TABLE IF NOT EXISTS tt_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','planning','executing','completed','failed')),
  plan JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  summary TEXT,
  ai_provider TEXT,
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_company ON tt_agent_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON tt_agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created ON tt_agent_tasks(created_at DESC);

-- 2) TABLA: tt_ai_summaries — Resúmenes ejecutivos diarios generados por IA
-- ============================================================

CREATE TABLE IF NOT EXISTS tt_ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES tt_companies(id) NOT NULL,
  date DATE NOT NULL,
  summary TEXT NOT NULL,
  highlights JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  concerns JSONB DEFAULT '[]',
  raw_data JSONB DEFAULT '{}',
  ai_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_company ON tt_ai_summaries(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_date ON tt_ai_summaries(date DESC);

-- 3) EXTENDER tt_documents — Campos OCR para comprobantes
-- ============================================================

ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS ocr_image_url TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS ocr_extracted_data JSONB;

-- Permitir type = 'gasto' (si hay CHECK constraint, agregar el valor)
-- Si no hay constraint, esto es un no-op y está bien
DO $$
BEGIN
  -- Intentar agregar 'gasto' al CHECK constraint si existe
  BEGIN
    ALTER TABLE tt_documents DROP CONSTRAINT IF EXISTS tt_documents_type_check;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- 4) RLS — Row Level Security en nuevas tablas
-- ============================================================

ALTER TABLE tt_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_ai_summaries ENABLE ROW LEVEL SECURITY;

-- Políticas: usuarios autenticados pueden ver/crear/actualizar registros de sus empresas
DROP POLICY IF EXISTS "agent_tasks_auth" ON tt_agent_tasks;
CREATE POLICY "agent_tasks_auth" ON tt_agent_tasks
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ai_summaries_auth" ON tt_ai_summaries;
CREATE POLICY "ai_summaries_auth" ON tt_ai_summaries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5) Notificar PostgREST para recargar schema
-- ============================================================

NOTIFY pgrst, 'reload schema';
