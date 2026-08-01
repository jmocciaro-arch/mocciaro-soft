-- migration-v75-shipping-guides.sql
-- Agrega columna metadata JSONB a tt_purchase_orders para soportar
-- guias de envio, ETA y adjuntos PDF en pedidos de compra locales.
-- Los documentos de tt_documents ya tienen metadata JSONB de origen.

ALTER TABLE tt_purchase_orders
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tt_purchase_orders.metadata IS
  'JSONB libre para extensiones sin migración. Campo reservado: shipping_guides (array de guías DHL/courier).';

-- ROLLBACK:
-- ALTER TABLE tt_purchase_orders DROP COLUMN IF EXISTS metadata;
