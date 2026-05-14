-- ============================================================================
-- MIGRACIÓN v79 — Arreglar trigger tt_sales_orders_auto_number
-- Aplicada: 2026-05-14
-- ============================================================================
-- El trigger referenciaba la columna 'so_number' que no existe — la columna
-- real se llama 'number'. Como el trigger fallaba, ningún INSERT en
-- tt_sales_orders podía completarse, lo que rompía silenciosamente
-- quoteToOrder() (el helper que el cotizador usa al apretar "Convertir en
-- pedido"). Por eso desde mediados de abril 2026 ningún pedido nuevo se
-- creaba aunque el botón parecía funcionar.
--
-- Síntoma observado: COT-2026-0006 estaba marcada como "aceptada" pero
-- tt_document_links no tenía link a un pedido, y PED-2026-0002 (única fila)
-- estaba sin items y con quote_id NULL (era data legacy del 13/04).
--
-- Test de verificación (post-fix):
--   BEGIN; INSERT INTO tt_sales_orders ...; INSERT INTO tt_so_items ...; ROLLBACK;
--   → pedido creado OK con 10 items insertados.
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
