-- =====================================================
-- Migration v27: Formato de código con año — COT-TT2026-0004
-- =====================================================
-- Cambio de formato:
--   ANTES: COT-TT-0001  (tipo - empresa - número)
--   AHORA: COT-TT2026-0004  (tipo - empresaAÑO - número)
-- La numeración se reinicia por año (secuencia por company+type+year).
-- =====================================================

-- 1) Agregar columna year a la secuencia
ALTER TABLE tt_document_sequences ADD COLUMN IF NOT EXISTS year INTEGER;

-- Si tenía registros sin year, los marcamos como año actual
UPDATE tt_document_sequences SET year = EXTRACT(YEAR FROM NOW())::INT WHERE year IS NULL;

-- Rehacer la PK para incluir year
ALTER TABLE tt_document_sequences DROP CONSTRAINT IF EXISTS tt_document_sequences_pkey;
ALTER TABLE tt_document_sequences ADD PRIMARY KEY (company_id, doc_type, year);

-- 2) Función actualizada: COT-TT2026-0004
CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INT;
BEGIN
  IF p_company_id IS NULL THEN RETURN NULL; END IF;

  SELECT code_prefix INTO v_prefix FROM tt_companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'XX'; END IF;

  v_type_code := CASE lower(p_type)
    WHEN 'cotizacion' THEN 'COT'
    WHEN 'orden_compra' THEN 'OC'
    WHEN 'pedido' THEN 'PED'
    WHEN 'albaran' THEN 'ALB'
    WHEN 'remito' THEN 'REM'
    WHEN 'packing_list' THEN 'PCK'
    WHEN 'factura' THEN 'FAC'
    WHEN 'factura_compra' THEN 'FCP'
    WHEN 'albaran_compra' THEN 'ALC'
    WHEN 'nota_credito' THEN 'NC'
    WHEN 'nota_debito' THEN 'ND'
    WHEN 'recibo' THEN 'REC'
    WHEN 'gasto' THEN 'GAS'
    WHEN 'presupuesto' THEN 'PRE'
    WHEN 'lead' THEN 'LEAD'
    WHEN 'oportunidad' THEN 'OPP'
    ELSE upper(p_type)
  END;

  INSERT INTO tt_document_sequences (company_id, doc_type, year, last_number)
  VALUES (p_company_id, p_type, v_year, 1)
  ON CONFLICT (company_id, doc_type, year) DO UPDATE
  SET last_number = tt_document_sequences.last_number + 1,
      updated_at = NOW()
  RETURNING last_number INTO v_num;

  -- Formato: COT-TT2026-0004
  RETURN v_type_code || '-' || v_prefix || v_year::text || '-' || lpad(v_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- NOTA: Los documentos ya migrados de StelOrder mantienen su
-- legal_number original (ej "FAC00001", "NRV00025"). El nuevo
-- formato solo se aplica a documentos creados desde Mocciaro Soft.
-- =====================================================
