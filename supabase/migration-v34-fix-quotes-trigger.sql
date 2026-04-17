-- =====================================================
-- Migration v34: FIX trigger de tt_quotes
-- =====================================================
-- La columna real es "number" (no "quote_number")
-- El trigger de v22 usaba "quote_number" que no existe
-- =====================================================

CREATE OR REPLACE FUNCTION tt_quotes_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.number IS NULL OR NEW.number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.number := next_document_code(NEW.company_id, 'cotizacion');
    EXCEPTION WHEN OTHERS THEN
      NEW.number := 'COTI-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- También fix: el código en cotizador/page.tsx manda "payment_terms"
-- pero la columna en tt_quotes podría no existir si v23 no se aplicó bien
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_days INTEGER;
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS payment_terms_type TEXT;

NOTIFY pgrst, 'reload schema';
