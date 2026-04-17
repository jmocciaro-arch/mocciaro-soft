-- =====================================================
-- Migration v22: Unificar auto-códigos con prefijo de empresa
-- en TODA la cadena de ventas
-- =====================================================
-- Agrega trigger tt_<table>_auto_code a: tt_quotes, tt_sales_orders,
-- tt_purchase_orders. Para que quote_number, so_number, po_number
-- se generen automáticamente como COTI-TT-0001, PED-TT-0001, etc
-- si vienen vacíos.
-- =====================================================

-- tt_quotes (cotizaciones)
CREATE OR REPLACE FUNCTION tt_quotes_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := next_document_code(NEW.company_id, 'cotizacion');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_quotes_auto_number ON tt_quotes;
CREATE TRIGGER trg_tt_quotes_auto_number
  BEFORE INSERT ON tt_quotes
  FOR EACH ROW EXECUTE FUNCTION tt_quotes_auto_number();

-- tt_sales_orders (pedidos de venta)
CREATE OR REPLACE FUNCTION tt_sales_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.so_number IS NULL OR NEW.so_number = '' THEN
    NEW.so_number := next_document_code(NEW.company_id, 'pedido');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_sales_orders_auto_number ON tt_sales_orders;
CREATE TRIGGER trg_tt_sales_orders_auto_number
  BEFORE INSERT ON tt_sales_orders
  FOR EACH ROW EXECUTE FUNCTION tt_sales_orders_auto_number();

-- tt_purchase_orders (órdenes de compra a proveedores)
CREATE OR REPLACE FUNCTION tt_purchase_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := next_document_code(NEW.company_id, 'orden_compra');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_purchase_orders_auto_number ON tt_purchase_orders;
CREATE TRIGGER trg_tt_purchase_orders_auto_number
  BEFORE INSERT ON tt_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION tt_purchase_orders_auto_number();

-- =====================================================
-- IA sobre tt_opportunities — reutiliza /api/leads/score
-- =====================================================
-- Las columnas IA ya se agregaron en v21. Acá aseguramos que están.
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_score INTEGER;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_temperature TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_tags TEXT[];
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_action TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_email TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_needs JSONB DEFAULT '{}';
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMPTZ;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_provider TEXT;

-- Vinculación Lead ↔ Opportunity ↔ Quote (cadena de conversión)
ALTER TABLE tt_leads ADD COLUMN IF NOT EXISTS converted_opportunity_id UUID REFERENCES tt_opportunities(id);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES tt_leads(id);

CREATE INDEX IF NOT EXISTS idx_opp_lead ON tt_opportunities(source_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_opp ON tt_leads(converted_opportunity_id);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
