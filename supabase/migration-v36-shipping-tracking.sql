-- =====================================================
-- Migration v36: Campos de envío y tracking en documentos
-- =====================================================

ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS shipping_tracking_number TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS shipping_tracking_url TEXT;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS shipping_weight_kg NUMERIC;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS shipping_packages INTEGER;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS shipping_estimated_delivery DATE;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS shipping_delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_docs_tracking ON tt_documents(shipping_tracking_number) WHERE shipping_tracking_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
