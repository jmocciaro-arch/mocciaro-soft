-- =====================================================
-- Migration v36: Facturacion Avanzada (Semana 4)
-- Partial payments, consolidated invoices, recurring, credit notes
-- =====================================================

-- 1) Partial payments on sales invoices
CREATE TABLE IF NOT EXISTS tt_invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES tt_documents(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES tt_invoices(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'transferencia' CHECK (payment_method IN ('transferencia', 'efectivo', 'tarjeta', 'cheque', 'pagare', 'compensacion', 'otro')),
  bank_reference TEXT,
  bank_account TEXT,
  notes TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_document ON tt_invoice_payments(document_id);
CREATE INDEX IF NOT EXISTS idx_ip_invoice ON tt_invoice_payments(invoice_id);

ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS payment_count INTEGER DEFAULT 0;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS last_payment_date DATE;

-- 2) Consolidated invoices
CREATE TABLE IF NOT EXISTS tt_invoice_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  source_document_id UUID NOT NULL REFERENCES tt_documents(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('albaran', 'delivery_note', 'pedido', 'sales_order')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(invoice_id, source_document_id)
);

CREATE INDEX IF NOT EXISTS idx_is_invoice ON tt_invoice_sources(invoice_id);
CREATE INDEX IF NOT EXISTS idx_is_source ON tt_invoice_sources(source_document_id);

-- 3) Recurring invoices
CREATE TABLE IF NOT EXISTS tt_recurring_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES tt_companies(id),
  client_id UUID NOT NULL REFERENCES tt_clients(id),
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT DEFAULT 'EUR',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 21,
  tax_amount NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')),
  next_date DATE NOT NULL,
  end_date DATE,
  day_of_month INTEGER DEFAULT 1,
  payment_terms TEXT,
  incoterm TEXT,
  notes TEXT,
  internal_notes TEXT,
  active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  total_generated INTEGER DEFAULT 0,
  created_by UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tt_recurring_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_invoice_id UUID NOT NULL REFERENCES tt_recurring_invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES tt_products(id),
  sku TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Sales credit notes
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS is_credit_note BOOLEAN DEFAULT false;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS credit_note_reason TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS original_invoice_id UUID REFERENCES tt_documents(id);

-- RLS
ALTER TABLE tt_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_invoice_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_recurring_invoice_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "ip_auth" ON tt_invoice_payments FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ip_service" ON tt_invoice_payments FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "is_auth" ON tt_invoice_sources FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "is_service" ON tt_invoice_sources FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ri_auth" ON tt_recurring_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ri_service" ON tt_recurring_invoices FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "rii_auth" ON tt_recurring_invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "rii_service" ON tt_recurring_invoice_items FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
