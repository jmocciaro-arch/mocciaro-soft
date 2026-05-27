-- ============================================================================
-- MIGRACIÓN v79 — Arreglar trigger tt_sales_orders_auto_number
-- Aplicada: 2026-05-14
-- ============================================================================
-- El trigger referenciaba 'so_number' pero la columna real se llama 'number'.
-- Esto rompía silenciosamente quoteToOrder() — el helper que el cotizador usa
-- al apretar "Convertir en pedido". Por eso desde mediados de abril ningún
-- pedido se creaba aunque el botón parecía funcionar.
-- ============================================================================

CREATE OR REPLACE FUNCTION tt_sales_orders_auto_number()
RETURNS trigger AS $$
BEGIN
  IF (NEW.number IS NULL OR NEW.number = '') AND NEW.company_id IS NOT NULL THEN
    BEGIN
      NEW.number := next_document_code(NEW.company_id, 'pedido');
    EXCEPTION WHEN OTHERS THEN
      NEW.number := 'PED-' || extract(epoch from now())::bigint::text;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
