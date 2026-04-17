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
