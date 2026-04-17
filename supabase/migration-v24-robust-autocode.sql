-- =====================================================
-- Migration v24: Robustecer triggers de auto-code
-- =====================================================
-- Si viene NULL como company_id o tipo no mapeado, NO rompemos el INSERT,
-- simplemente dejamos el code en NULL (se puede asignar después).
-- =====================================================

CREATE OR REPLACE FUNCTION next_document_code(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_type_code TEXT;
  v_num INTEGER;
BEGIN
  -- Si no viene company_id, no generamos code (retornamos NULL)
  IF p_company_id IS NULL THEN
    RETURN NULL;
  END IF;

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

-- Hacer TODOS los triggers tolerantes a errores: si falla la generación, no rompen el INSERT
CREATE OR REPLACE FUNCTION tt_opportunities_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.code IS NULL OR NEW.code = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.code := next_document_code(NEW.company_id, 'oportunidad');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error generando code para oportunidad: %', SQLERRM;
      NEW.code := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_leads_auto_code()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.code IS NULL OR NEW.code = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.code := next_document_code(NEW.company_id, 'lead');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error generando code para lead: %', SQLERRM;
      NEW.code := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_documents_auto_system_code()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.system_code IS NULL OR NEW.system_code = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.system_code := next_document_code(NEW.company_id, NEW.type);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error generando system_code: %', SQLERRM;
      -- Fallback: usar timestamp
      NEW.system_code := 'DOC-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_quotes_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.quote_number IS NULL OR NEW.quote_number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.quote_number := next_document_code(NEW.company_id, 'cotizacion');
    EXCEPTION WHEN OTHERS THEN
      NEW.quote_number := 'COTI-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_sales_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.so_number IS NULL OR NEW.so_number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.so_number := next_document_code(NEW.company_id, 'pedido');
    EXCEPTION WHEN OTHERS THEN
      NEW.so_number := 'PED-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tt_purchase_orders_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.po_number IS NULL OR NEW.po_number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.po_number := next_document_code(NEW.company_id, 'orden_compra');
    EXCEPTION WHEN OTHERS THEN
      NEW.po_number := 'OC-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
