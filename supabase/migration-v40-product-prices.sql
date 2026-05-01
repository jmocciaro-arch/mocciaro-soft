-- =====================================================
-- Migration v40: Tabla tt_product_prices
-- Precios por empresa para cada producto.
-- Reemplaza el enfoque de columnas fijas
-- (price_eur, price_usd, price_ars) con una tabla
-- relacional que escala a cualquier número de empresas.
-- =====================================================

CREATE TABLE IF NOT EXISTS tt_product_prices (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id    uuid        NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  company_id    uuid        NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  currency_code text        NOT NULL DEFAULT 'EUR',
  purchase_price numeric(14,4),
  sale_price     numeric(14,4),
  min_price      numeric(14,4),
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, company_id)
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_product_prices_product  ON tt_product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_company  ON tt_product_prices(company_id);

-- RLS
ALTER TABLE tt_product_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_service_full"   ON tt_product_prices;
DROP POLICY IF EXISTS "pp_auth_all"       ON tt_product_prices;

CREATE POLICY "pp_service_full" ON tt_product_prices
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "pp_auth_all" ON tt_product_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_prices_updated_at ON tt_product_prices;
CREATE TRIGGER trg_product_prices_updated_at
  BEFORE UPDATE ON tt_product_prices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
