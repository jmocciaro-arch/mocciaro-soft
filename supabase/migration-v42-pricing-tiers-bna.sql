-- ================================================================
-- MIGRATION V42 — PRICING TIERS + BNA EXCHANGE RATES
-- Sistema de precios con tiers (PVP, Cliente A, Distribuidor)
-- + cotizaciones automáticas desde Banco Nación
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) COTIZACIONES (BNA scraper)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_exchange_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL,           -- 'USD', 'EUR', 'GBP', etc
  buy           numeric(12,4) NOT NULL,  -- compra divisa
  sell          numeric(12,4) NOT NULL,  -- venta divisa (usamos esta para convertir precios)
  source        text NOT NULL DEFAULT 'BNA',
  rate_date     date NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(currency_code, rate_date, source)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_latest ON tt_exchange_rates(currency_code, rate_date DESC);

-- ----------------------------------------------------------------
-- 2) TIERS DE PRECIOS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_price_tiers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,     -- 'pvp', 'cliente_a', 'distribuidor'
  name          text NOT NULL,
  sort_order    int NOT NULL DEFAULT 0,
  description   text,
  discount_hint numeric(5,2),             -- % sugerido vs PVP (informativo)
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tt_price_tiers (code, name, sort_order, description, discount_hint) VALUES
  ('pvp',          'PVP',                10, 'Precio de venta al público — el más alto',  0),
  ('cliente_a',    'Cliente Clase A',    20, 'Clientes preferenciales con descuento',   -15),
  ('distribuidor', 'Distribuidor',       30, 'Distribuidores / reventa',                -30)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  discount_hint = EXCLUDED.discount_hint;

-- ----------------------------------------------------------------
-- 3) PRECIOS POR TIER (reemplaza parte de tt_product_prices)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_product_tier_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES tt_companies(id) ON DELETE CASCADE, -- NULL = aplica al grupo
  tier_code       text NOT NULL REFERENCES tt_price_tiers(code),
  base_currency   text NOT NULL,          -- 'ARS' | 'USD' | 'EUR'
  base_price      numeric(14,2) NOT NULL, -- valor editado manualmente
  -- Cache de conversiones (se recalculan al actualizar cotización o editar base)
  price_ars       numeric(14,2),
  price_usd       numeric(14,2),
  price_eur       numeric(14,2),
  exchange_rate_date date,                -- qué cotización usó para las conversiones
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, company_id, tier_code)
);

CREATE INDEX IF NOT EXISTS idx_tier_prices_product ON tt_product_tier_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_tier_prices_company ON tt_product_tier_prices(company_id);

-- ----------------------------------------------------------------
-- 4) AMPLIAR tt_products con costo/mínimo base currency
-- ----------------------------------------------------------------
ALTER TABLE tt_products
  ADD COLUMN IF NOT EXISTS cost_base_currency text,
  ADD COLUMN IF NOT EXISTS cost_base_price    numeric(14,2),
  ADD COLUMN IF NOT EXISTS min_sale_currency  text,
  ADD COLUMN IF NOT EXISTS min_sale_price     numeric(14,2);

-- ================================================================
-- RLS
-- ================================================================
ALTER TABLE tt_exchange_rates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_price_tiers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_product_tier_prices   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "exch_rates_read" ON tt_exchange_rates FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "exch_rates_all"  ON tt_exchange_rates FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "price_tiers_read" ON tt_price_tiers FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "price_tiers_all"  ON tt_price_tiers FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "tier_prices_read" ON tt_product_tier_prices FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "tier_prices_write_auth" ON tt_product_tier_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "tier_prices_all"  ON tt_product_tier_prices FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================================================================
-- FUNCIÓN HELPER: obtener cotización del día (o la más reciente)
-- ================================================================
CREATE OR REPLACE FUNCTION get_latest_exchange_rate(p_currency text)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT sell FROM tt_exchange_rates
  WHERE currency_code = upper(p_currency)
  ORDER BY rate_date DESC, fetched_at DESC
  LIMIT 1;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
