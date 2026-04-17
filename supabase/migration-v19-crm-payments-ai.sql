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
