-- =====================================================
-- Migration v21: Fix tt_opportunities - columnas faltantes
-- =====================================================
-- El schema.sql tiene estas columnas pero la DB real las perdió
-- (probablemente por recreación parcial). Las agregamos si faltan.
-- =====================================================

ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES tt_users(id);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 10;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS expected_close_date DATE;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES tt_quotes(id);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS notes TEXT;

-- El CRM viejo maneja también estos campos:
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS product_interest TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS urgency TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS next_action_date DATE;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS next_action_type TEXT;

-- Extender con campos IA (mismo enfoque que tt_leads)
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100);
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_temperature TEXT CHECK (ai_temperature IN ('hot','warm','cold'));
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_tags TEXT[];
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_action TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_suggested_email TEXT;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_needs JSONB DEFAULT '{}';
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMPTZ;
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS ai_provider TEXT;

-- Agregar código de oportunidad con prefijo de empresa (OPP-TT-0001)
ALTER TABLE tt_opportunities ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

CREATE OR REPLACE FUNCTION tt_opportunities_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := next_document_code(NEW.company_id, 'oportunidad');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_opportunities_auto_code ON tt_opportunities;
CREATE TRIGGER trg_tt_opportunities_auto_code
  BEFORE INSERT ON tt_opportunities
  FOR EACH ROW EXECUTE FUNCTION tt_opportunities_auto_code();

-- Actualizar next_document_code para incluir 'oportunidad' → OPP
CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'XX'; END IF;

  v_type_code := CASE lower(p_type)
    WHEN 'cotizacion' THEN 'COTI'
    WHEN 'orden_compra' THEN 'OC'
    WHEN 'pedido' THEN 'PED'
    WHEN 'albaran' THEN 'ALB'
    WHEN 'remito' THEN 'REM'
    WHEN 'factura' THEN 'FAC'
    WHEN 'nota_credito' THEN 'NC'
    WHEN 'nota_debito' THEN 'ND'
    WHEN 'recibo' THEN 'REC'
    WHEN 'presupuesto' THEN 'PRE'
    WHEN 'lead' THEN 'LEAD'
    WHEN 'oportunidad' THEN 'OPP'
    ELSE upper(p_type)
  END;

  INSERT INTO tt_document_sequences (company_id, doc_type, last_number)
  VALUES (p_company_id, p_type, 1)
  ON CONFLICT (company_id, doc_type) DO UPDATE
  SET last_number = tt_document_sequences.last_number + 1,
      updated_at = NOW()
  RETURNING last_number INTO v_num;

  RETURN v_type_code || '-' || v_prefix || '-' || lpad(v_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Reload schema cache de PostgREST (para que aparezcan las nuevas columnas ya)
NOTIFY pgrst, 'reload schema';
