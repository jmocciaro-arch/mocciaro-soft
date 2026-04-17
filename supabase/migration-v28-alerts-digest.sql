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
