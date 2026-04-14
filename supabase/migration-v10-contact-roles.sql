-- =====================================================
-- Migration v10: Contact favorites + predefined roles
-- =====================================================

-- Multi-favorite (instead of single is_primary)
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- Backfill: copy is_primary to is_favorite
UPDATE tt_client_contacts SET is_favorite = is_primary
WHERE is_primary = true AND is_favorite IS NULL;

-- Default roles (array of document types where this contact should be used by default)
-- Values: 'cotizacion', 'factura', 'remito', 'reclamo', 'mantenimiento', 'pagos', 'logistica'
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS default_roles TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_client_contacts_roles
  ON tt_client_contacts USING gin (default_roles);
