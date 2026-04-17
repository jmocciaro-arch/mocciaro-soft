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
