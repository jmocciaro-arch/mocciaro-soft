-- =====================================================
-- Migration v23: Condición de pago en cotizaciones
-- =====================================================
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_days INTEGER;
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_terms_type TEXT
  CHECK (payment_terms_type IN ('contado','anticipado','dias_ff','dias_fv','dias_fr','custom'));

-- Mismos campos en pedidos y facturas (para que fluyan en la cadena)
ALTER TABLE tt_sales_orders ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE tt_sales_orders ADD COLUMN IF NOT EXISTS payment_days INTEGER;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS payment_days INTEGER;
-- payment_terms ya existe en tt_documents

NOTIFY pgrst, 'reload schema';
