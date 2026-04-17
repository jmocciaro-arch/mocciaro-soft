-- =====================================================
-- Migration v34: Documentos Flexibles (Semana 2)
-- Document subtypes + editable templates
-- =====================================================

-- 1) Document subtypes: allow a quote to be cotizacion/presupuesto/proforma/packing
ALTER TABLE tt_quotes
  ADD COLUMN IF NOT EXISTS doc_subtype TEXT NOT NULL DEFAULT 'cotizacion';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tt_quotes_doc_subtype_check') THEN
    ALTER TABLE tt_quotes ADD CONSTRAINT tt_quotes_doc_subtype_check
      CHECK (doc_subtype IN ('cotizacion', 'presupuesto', 'proforma', 'packing_list', 'oferta'));
  END IF;
END $$;

-- Also for tt_documents (unified table)
ALTER TABLE tt_documents
  ADD COLUMN IF NOT EXISTS doc_subtype TEXT;

-- 2) Document templates (editable by user)
CREATE TABLE IF NOT EXISTS tt_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  company_id UUID REFERENCES tt_companies(id),
  is_default BOOLEAN DEFAULT false,
  language TEXT DEFAULT 'es',
  header_html TEXT,
  footer_html TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#FF6600',
  secondary_color TEXT DEFAULT '#1E2330',
  font_family TEXT DEFAULT 'Arial, sans-serif',
  show_logo BOOLEAN DEFAULT true,
  show_company_address BOOLEAN DEFAULT true,
  show_client_tax_id BOOLEAN DEFAULT true,
  show_sku BOOLEAN DEFAULT true,
  show_discount BOOLEAN DEFAULT true,
  show_unit_price BOOLEAN DEFAULT true,
  show_photos BOOLEAN DEFAULT false,
  show_notes BOOLEAN DEFAULT true,
  show_bank_details BOOLEAN DEFAULT true,
  show_terms BOOLEAN DEFAULT true,
  show_incoterm BOOLEAN DEFAULT true,
  show_payment_terms BOOLEAN DEFAULT true,
  show_valid_until BOOLEAN DEFAULT true,
  show_delivery_date BOOLEAN DEFAULT true,
  show_page_numbers BOOLEAN DEFAULT true,
  terms_text TEXT,
  footer_text TEXT,
  custom_css TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO tt_document_templates (name, doc_type, is_default, language, terms_text, footer_text)
VALUES
  ('Cotizacion estandar', 'cotizacion', true, 'es',
   'Esta oferta es valida por 30 dias desde la fecha de emision. Los precios no incluyen transporte salvo indicacion contraria. IVA no incluido.',
   'Gracias por confiar en TorqueTools.'),
  ('Presupuesto estandar', 'presupuesto', true, 'es',
   'Presupuesto valido por 30 dias. Precios sujetos a disponibilidad de stock. Plazo de entrega a confirmar.',
   'Quedamos a su disposicion.'),
  ('Proforma', 'proforma', true, 'es',
   'Este documento es una factura proforma sin valor fiscal. Solo a efectos de informacion.',
   'Proforma generada por TorqueTools.'),
  ('Packing List', 'packing_list', true, 'es', NULL, 'Documento de envio.'),
  ('Pedido de Venta', 'pedido', true, 'es',
   'Pedido confirmado. Plazo de entrega segun disponibilidad.', NULL),
  ('Factura', 'factura', true, 'es',
   'Factura pagadera a los terminos indicados. Intereses de mora: 1.5% mensual.', NULL),
  ('Albaran', 'albaran', true, 'es',
   'Mercancia entregada conforme. El receptor confirma la recepcion en buen estado.', NULL)
ON CONFLICT DO NOTHING;

ALTER TABLE tt_document_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "templates_auth" ON tt_document_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "templates_service" ON tt_document_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
