-- =====================================================
-- Migration v18: Configuración Tango Factura por empresa
-- =====================================================
-- Extiende tt_invoice_providers para guardar credenciales Tango
-- (UserIdentifier, ApplicationPublicKey, PerfilComprobanteID)
-- =====================================================

-- Agregar helpers para cachear datos maestros Tango
CREATE TABLE IF NOT EXISTS tt_tango_maestros_cache (
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,          -- alicuotas | monedas | puntos_venta | perfiles | categorias_impositivas | tipos_documento
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, tipo)
);

-- Vincular clientes ERP con Tango
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS tango_cliente_codigo TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS tango_cliente_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_clients_tango_codigo ON tt_clients(tango_cliente_codigo);

-- Vincular productos ERP con Tango
ALTER TABLE tt_products ADD COLUMN IF NOT EXISTS tango_producto_codigo TEXT;
CREATE INDEX IF NOT EXISTS idx_products_tango_codigo ON tt_products(tango_producto_codigo);

-- Campo en tt_documents para el ID del movimiento en Tango
-- (ya existe tango_invoice_id en v17, agregamos autorizado_at)
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS tango_autorizado_at TIMESTAMPTZ;
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS tango_movimiento_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_documents_tango_mov ON tt_documents(tango_movimiento_id);

-- RLS en cache
ALTER TABLE tt_tango_maestros_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tango_cache_all_authenticated" ON tt_tango_maestros_cache;
CREATE POLICY "tango_cache_all_authenticated" ON tt_tango_maestros_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- NOTA: Las credenciales se guardan en tt_invoice_providers.config (JSONB):
-- {
--   "user_identifier": "...",
--   "application_public_key": "...",
--   "perfil_comprobante_id": 1234,
--   "punto_venta_default": 1
-- }
-- =====================================================
