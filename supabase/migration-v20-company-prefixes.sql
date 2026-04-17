-- =====================================================
-- Migration v20: Prefijos por empresa + numeración de documentos
-- =====================================================
-- Agrega:
--   1) tt_companies.code_prefix (2 letras)
--   2) tt_companies.trade_name (nombre fantasía)
--   3) tt_companies.legal_name (razón social)
--   4) tt_companies.tax_id (CUIT/NIF/EIN)
--   5) Secuencia por empresa+tipo para nº correlativo
--   6) Función next_document_code() para generar "COTI-TT-0042"
--   7) Trigger opcional para auto-asignar system_code si viene vacío
-- =====================================================

-- 1) Campos fiscales en empresas
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS code_prefix TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS tax_id_type TEXT;  -- 'CUIT'|'NIF'|'EIN'

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code_prefix ON tt_companies(code_prefix) WHERE code_prefix IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_tax_id ON tt_companies(tax_id);

-- 2) Seed prefijos/identidad para las 4 empresas conocidas
-- (solo si el nombre matchea y aún no tienen prefix)
UPDATE tt_companies SET
  code_prefix = 'TT',
  trade_name = COALESCE(trade_name, 'Torquetools'),
  legal_name = COALESCE(legal_name, 'Torquetools SL'),
  tax_id_type = 'NIF'
WHERE (name ILIKE '%torquetools%' OR name ILIKE '%torque tools%')
  AND (country ILIKE '%spain%' OR country = 'ES' OR country ILIKE '%españa%')
  AND code_prefix IS NULL;

UPDATE tt_companies SET
  code_prefix = 'BS',
  trade_name = COALESCE(trade_name, 'Buscatools'),
  legal_name = COALESCE(legal_name, 'Mocciaro Juan Manuel Jesus'),
  tax_id = COALESCE(tax_id, '20-27089205-2'),
  tax_id_type = 'CUIT'
WHERE name ILIKE '%buscatools%'
  AND code_prefix IS NULL;

UPDATE tt_companies SET
  code_prefix = 'TQ',
  trade_name = COALESCE(trade_name, 'Torquear'),
  legal_name = COALESCE(legal_name, 'Torquear SA'),
  tax_id = COALESCE(tax_id, '33-71159029-9'),
  tax_id_type = 'CUIT'
WHERE name ILIKE '%torquear%'
  AND code_prefix IS NULL;

UPDATE tt_companies SET
  code_prefix = 'GA',
  trade_name = COALESCE(trade_name, 'Global Assembly'),
  legal_name = COALESCE(legal_name, 'Global Assembly Solutions LLC'),
  tax_id_type = 'EIN'
WHERE name ILIKE '%global assembly%'
  AND code_prefix IS NULL;

-- 3) Secuencia por empresa+tipo (persiste en tabla)
CREATE TABLE IF NOT EXISTS tt_document_sequences (
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, doc_type)
);

-- 4) Mapeo type → prefijo de tipo
-- cotizacion     → COTI
-- orden_compra   → OC
-- pedido         → PED
-- albaran/remito → REM (AR) | ALB (ES)
-- factura        → FAC
-- nota_credito   → NC
-- nota_debito    → ND
-- recibo         → REC

-- 5) Función para generar el próximo código: "COTI-TT-0042"
CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN
    v_prefix := 'XX';
  END IF;

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

-- 6) Trigger opcional: si system_code viene vacío, auto-generar
CREATE OR REPLACE FUNCTION tt_documents_auto_system_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.system_code IS NULL OR NEW.system_code = '' THEN
    NEW.system_code := next_document_code(NEW.company_id, NEW.type);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_documents_auto_code ON tt_documents;
CREATE TRIGGER trg_tt_documents_auto_code
  BEFORE INSERT ON tt_documents
  FOR EACH ROW EXECUTE FUNCTION tt_documents_auto_system_code();

-- 7) Mismo tratamiento para tt_leads (prefijo LEAD-TT-0001)
ALTER TABLE tt_leads ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

CREATE OR REPLACE FUNCTION tt_leads_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := next_document_code(NEW.company_id, 'lead');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_leads_auto_code ON tt_leads;
CREATE TRIGGER trg_tt_leads_auto_code
  BEFORE INSERT ON tt_leads
  FOR EACH ROW EXECUTE FUNCTION tt_leads_auto_code();

-- Extender función para soportar 'lead'
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
