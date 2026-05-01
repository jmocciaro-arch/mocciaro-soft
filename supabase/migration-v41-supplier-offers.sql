-- =====================================================
-- Migration v41: Cotizaciones de proveedor + Historico precios
-- =====================================================

-- 1) Supplier offers (PDF cotizaciones puntuales)
CREATE TABLE IF NOT EXISTS tt_supplier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES tt_suppliers(id),
  supplier_name TEXT NOT NULL,
  offer_number TEXT,
  offer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  currency TEXT DEFAULT 'EUR',
  subtotal NUMERIC(14,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  payment_terms TEXT,
  incoterm TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'accepted', 'rejected', 'expired')),
  source_type TEXT DEFAULT 'pdf' CHECK (source_type IN ('pdf', 'excel', 'email', 'manual')),
  source_url TEXT,
  pdf_url TEXT,
  ai_extracted JSONB DEFAULT '{}',
  company_id UUID REFERENCES tt_companies(id),
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tt_supplier_offer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES tt_supplier_offers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES tt_products(id),
  sku TEXT,
  supplier_sku TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0,
  is_new_product BOOLEAN DEFAULT false,
  matched_by TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Price history (every cost/price change)
CREATE TABLE IF NOT EXISTS tt_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES tt_suppliers(id),
  supplier_name TEXT,
  price_type TEXT NOT NULL DEFAULT 'cost' CHECK (price_type IN ('cost', 'price_eur', 'price_usd', 'price_ars', 'special')),
  old_price NUMERIC(12,2),
  new_price NUMERIC(12,2) NOT NULL,
  variation_pct NUMERIC(7,2),
  currency TEXT DEFAULT 'EUR',
  source_type TEXT CHECK (source_type IN ('pdf_offer', 'excel_update', 'manual', 'import', 'api')),
  source_id UUID,
  source_url TEXT,
  notes TEXT,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  recorded_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON tt_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_supplier ON tt_price_history(supplier_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON tt_price_history(created_at DESC);

-- 3) Trigger: auto-record price history
CREATE OR REPLACE FUNCTION record_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.cost_eur IS DISTINCT FROM NEW.cost_eur AND NEW.cost_eur IS NOT NULL THEN
    INSERT INTO tt_price_history (product_id, price_type, old_price, new_price, variation_pct, currency, source_type)
    VALUES (NEW.id, 'cost', OLD.cost_eur, NEW.cost_eur,
      CASE WHEN OLD.cost_eur > 0 THEN ROUND(((NEW.cost_eur - OLD.cost_eur) / OLD.cost_eur * 100)::NUMERIC, 2) ELSE 0 END,
      'EUR', 'manual');
  END IF;
  IF OLD.price_eur IS DISTINCT FROM NEW.price_eur AND NEW.price_eur IS NOT NULL THEN
    INSERT INTO tt_price_history (product_id, price_type, old_price, new_price, variation_pct, currency, source_type)
    VALUES (NEW.id, 'price_eur', OLD.price_eur, NEW.price_eur,
      CASE WHEN OLD.price_eur > 0 THEN ROUND(((NEW.price_eur - OLD.price_eur) / OLD.price_eur * 100)::NUMERIC, 2) ELSE 0 END,
      'EUR', 'manual');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_history ON tt_products;
CREATE TRIGGER trg_price_history
  AFTER UPDATE ON tt_products
  FOR EACH ROW EXECUTE FUNCTION record_price_change();

-- 4) Storage bucket for offer PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-offers', 'supplier-offers', false)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE tt_supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_supplier_offer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_price_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "so_auth" ON tt_supplier_offers FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "so_service" ON tt_supplier_offers FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "soi_auth" ON tt_supplier_offer_items FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "soi_service" ON tt_supplier_offer_items FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ph_auth" ON tt_price_history FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ph_service" ON tt_price_history FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
