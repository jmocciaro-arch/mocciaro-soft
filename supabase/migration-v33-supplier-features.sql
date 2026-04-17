-- ============================================================
-- MIGRATION V33 — Supplier Features: AI scoring, interactions,
--                 document chain, portal tokens, email tracking
-- ============================================================

-- 1) EXTENDER tt_suppliers — campos AI + portal
-- ============================================================

ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS ai_score          INTEGER;
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS ai_tags           TEXT[]    DEFAULT '{}';
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS ai_analysis       TEXT;
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS ai_profile        JSONB     DEFAULT '{}';
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS ai_analysis_at    TIMESTAMPTZ;
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS ai_provider       TEXT;
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS portal_token      TEXT      UNIQUE;
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ;
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS portal_last_seen  TIMESTAMPTZ;
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS is_duplicate_of   UUID      REFERENCES tt_suppliers(id);

-- ai_profile structure:
-- {
--   "delivery_score": 0-100,      -- cumple plazos
--   "quality_score": 0-100,       -- calidad del producto
--   "price_score": 0-100,         -- competitividad de precios
--   "reliability_score": 0-100,   -- fiabilidad general
--   "avg_delivery_days": number,
--   "on_time_rate": 0-1,
--   "defect_rate": 0-1,
--   "preferred_products": ["product1", "product2"],
--   "avg_po_value": number,
--   "total_spent_ytd": number,
--   "last_analysis_summary": "texto"
-- }

CREATE INDEX IF NOT EXISTS idx_suppliers_ai_score  ON tt_suppliers(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_suppliers_portal_token ON tt_suppliers(portal_token);

-- 2) TABLA: tt_supplier_interactions — timeline de interacciones
-- ============================================================

CREATE TABLE IF NOT EXISTS tt_supplier_interactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES tt_companies(id) NOT NULL,
  supplier_id  UUID        REFERENCES tt_suppliers(id) NOT NULL,
  type         TEXT        NOT NULL CHECK (type IN (
                 'email_sent','email_received','call','meeting',
                 'complaint','quality_issue','price_negotiation',
                 'delivery_issue','payment_sent','note','other'
               )),
  direction    TEXT        CHECK (direction IN ('outbound','inbound','internal')),
  subject      TEXT,
  body         TEXT,
  outcome      TEXT,
  rating       INTEGER     CHECK (rating BETWEEN 1 AND 5),
  document_ref TEXT,
  metadata     JSONB       DEFAULT '{}',
  created_by   UUID        REFERENCES tt_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supp_interactions_supplier ON tt_supplier_interactions(supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supp_interactions_company  ON tt_supplier_interactions(company_id);
CREATE INDEX IF NOT EXISTS idx_supp_interactions_type     ON tt_supplier_interactions(type);

-- RLS
ALTER TABLE tt_supplier_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_interactions_auth" ON tt_supplier_interactions;
CREATE POLICY "supplier_interactions_auth" ON tt_supplier_interactions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3) EXTENDER tt_email_log — vincular a proveedor
-- ============================================================

ALTER TABLE tt_email_log ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES tt_suppliers(id);

CREATE INDEX IF NOT EXISTS idx_email_log_supplier ON tt_email_log(supplier_id) WHERE supplier_id IS NOT NULL;

-- 4) TABLA: tt_supplier_portal_tokens — tokens de portal para proveedores
-- ============================================================

CREATE TABLE IF NOT EXISTS tt_supplier_portal_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES tt_companies(id) NOT NULL,
  supplier_id  UUID        REFERENCES tt_suppliers(id) NOT NULL,
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active    BOOLEAN     DEFAULT true,
  expires_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by   UUID        REFERENCES tt_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supp_portal_tokens_token    ON tt_supplier_portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_supp_portal_tokens_supplier ON tt_supplier_portal_tokens(supplier_id);

ALTER TABLE tt_supplier_portal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_portal_tokens_auth" ON tt_supplier_portal_tokens;
CREATE POLICY "supplier_portal_tokens_auth" ON tt_supplier_portal_tokens
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Tokens de portal son públicos (acceso sin auth, solo con token válido)
DROP POLICY IF EXISTS "supplier_portal_tokens_public_read" ON tt_supplier_portal_tokens;
CREATE POLICY "supplier_portal_tokens_public_read" ON tt_supplier_portal_tokens
  FOR SELECT TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));
