-- =====================================================
-- Migration v35: Compras Inteligentes (Semana 3)
-- PO vs Invoice comparison, credit notes, expense types
-- =====================================================

-- 1) Purchase invoice line items (to compare against PO items)
CREATE TABLE IF NOT EXISTS tt_purchase_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES tt_purchase_invoices(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES tt_po_items(id),
  product_id UUID REFERENCES tt_products(id),
  sku TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0,
  is_new_item BOOLEAN DEFAULT false,
  price_differs BOOLEAN DEFAULT false,
  qty_differs BOOLEAN DEFAULT false,
  po_unit_price NUMERIC(12,2),
  po_quantity NUMERIC(10,2),
  comparison_status TEXT DEFAULT 'pending' CHECK (comparison_status IN ('pending', 'matched', 'differs', 'new', 'missing', 'confirmed')),
  confirmed_by UUID REFERENCES tt_users(id),
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pii_invoice ON tt_purchase_invoice_items(purchase_invoice_id);

-- 2) Purchase credit notes
CREATE TABLE IF NOT EXISTS tt_purchase_credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL,
  company_id UUID REFERENCES tt_companies(id),
  supplier_id UUID REFERENCES tt_suppliers(id),
  purchase_invoice_id UUID REFERENCES tt_purchase_invoices(id),
  supplier_cn_number TEXT,
  supplier_cn_date DATE,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  currency TEXT DEFAULT 'EUR',
  subtotal NUMERIC(14,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tt_purchase_credit_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES tt_purchase_credit_notes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES tt_products(id),
  sku TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Expense types
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS expense_type TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS tax_deductible BOOLEAN DEFAULT true;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS expense_category TEXT;

-- 4) Comparison fields on purchase invoices
ALTER TABLE tt_purchase_invoices ADD COLUMN IF NOT EXISTS comparison_status TEXT DEFAULT 'pending';
ALTER TABLE tt_purchase_invoices ADD COLUMN IF NOT EXISTS po_total NUMERIC(14,2);
ALTER TABLE tt_purchase_invoices ADD COLUMN IF NOT EXISTS difference_amount NUMERIC(14,2);
ALTER TABLE tt_purchase_invoices ADD COLUMN IF NOT EXISTS difference_notes TEXT;
ALTER TABLE tt_purchase_invoices ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES tt_users(id);
ALTER TABLE tt_purchase_invoices ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- RLS
ALTER TABLE tt_purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_purchase_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_purchase_credit_note_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "pii_auth" ON tt_purchase_invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pii_service" ON tt_purchase_invoice_items FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pcn_auth" ON tt_purchase_credit_notes FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pcn_service" ON tt_purchase_credit_notes FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pcni_auth" ON tt_purchase_credit_note_items FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pcni_service" ON tt_purchase_credit_note_items FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
