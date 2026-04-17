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
