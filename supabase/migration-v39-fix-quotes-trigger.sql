-- =====================================================
-- Migration v39: Fix trigger tt_quotes_auto_number
-- =====================================================
-- Causa:
--   v22 y v24 crearon el trigger tt_quotes_auto_number() referenciando
--   NEW.quote_number. En la BD real la columna se llama `number`
--   (hubo un RENAME en algún punto que no quedó en schema.sql).
--   Como consecuencia, TODO INSERT en tt_quotes fallaba con:
--     record "new" has no field "quote_number"
--
-- Efecto:
--   Se rompió el guardado del cotizador viejo (saveQuote()).
--   Este trigger es BEFORE INSERT y reventaba antes de cualquier RLS.
--
-- Fix:
--   Redefinir la función usando NEW.number. La firma y el nombre del
--   trigger (trg_tt_quotes_auto_number) se mantienen, por lo que no
--   hace falta tocar CREATE TRIGGER.
--
-- Nota:
--   Este es un parche puente. El plan general es migrar el cotizador
--   viejo a tt_documents (ver plan Fase 1). Mientras tanto, con este
--   fix el guardado vuelve a funcionar.
-- =====================================================

CREATE OR REPLACE FUNCTION tt_quotes_auto_number()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.number IS NULL OR NEW.number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.number := next_document_code(NEW.company_id, 'cotizacion');
    EXCEPTION WHEN OTHERS THEN
      NEW.number := 'COTI-' || extract(epoch FROM now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Forzar recarga de schema cache en PostgREST/Supabase.
NOTIFY pgrst, 'reload schema';
