-- =====================================================
-- Migration v33: Precios y Catalogo (Semana 1)
-- Product types, price min, client prices, price lists
-- =====================================================

-- 1) Product type (product / service / expense)
ALTER TABLE tt_products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'product';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tt_products_product_type_check') THEN
    ALTER TABLE tt_products ADD CONSTRAINT tt_products_product_type_check
      CHECK (product_type IN ('product', 'service', 'expense'));
  END IF;
END $$;

-- 2) Minimum price
ALTER TABLE tt_products
  ADD COLUMN IF NOT EXISTS price_min NUMERIC(12,2) DEFAULT NULL;

-- 3) Price lists (multitarifas)
CREATE TABLE IF NOT EXISTS tt_price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT DEFAULT 'EUR',
  is_default BOOLEAN DEFAULT false,
  markup_pct NUMERIC(5,2) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  company_id UUID REFERENCES tt_companies(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tt_price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES tt_price_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(price_list_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pli_list ON tt_price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_pli_product ON tt_price_list_items(product_id);

-- 4) Client special prices
CREATE TABLE IF NOT EXISTS tt_client_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES tt_clients(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  special_price NUMERIC(12,2),
  discount_pct NUMERIC(5,2) DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  valid_from DATE,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_client ON tt_client_prices(client_id);
CREATE INDEX IF NOT EXISTS idx_cp_product ON tt_client_prices(product_id);

-- 5) Add price_list_id and default_discount to clients
ALTER TABLE tt_clients
  ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES tt_price_lists(id);
ALTER TABLE tt_clients
  ADD COLUMN IF NOT EXISTS default_discount NUMERIC(5,2) DEFAULT 0;

-- 6) Default price lists
INSERT INTO tt_price_lists (name, description, currency, is_default, markup_pct, active)
VALUES
  ('Tarifa Publica', 'Precios de catalogo (PVP)', 'EUR', true, 0, true),
  ('Tarifa Distribuidor', 'Precios para distribuidores (-20%)', 'EUR', false, -20, true),
  ('Tarifa OEM', 'Precios para fabricantes (-30%)', 'EUR', false, -30, true),
  ('Tarifa Exportacion', 'Precios para exportacion (USD)', 'USD', false, 0, true)
ON CONFLICT DO NOTHING;

-- 7) RLS
ALTER TABLE tt_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_client_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "price_lists_auth" ON tt_price_lists FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "price_list_items_auth" ON tt_price_list_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "client_prices_auth" ON tt_client_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "price_lists_service" ON tt_price_lists FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "price_list_items_service" ON tt_price_list_items FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "client_prices_service" ON tt_client_prices FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
