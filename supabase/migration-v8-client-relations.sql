-- =====================================================
-- Migration v8: Client Relations + Contact Sync
-- =====================================================

-- 1. Table for related companies (transportista, despachante, hermana, etc.)
CREATE TABLE IF NOT EXISTS tt_client_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES tt_clients(id),
  related_client_id UUID NOT NULL REFERENCES tt_clients(id),
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'transportista', 'despachante', 'empresa_hermana', 'representante',
    'proveedor', 'distribuidor', 'agente', 'otro'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, related_client_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_client_relations_client ON tt_client_relations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_relations_related ON tt_client_relations(related_client_id);

-- 2. Add email_domain column to tt_clients for quick domain lookup
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS email_domain TEXT;

-- 3. Backfill email_domain from existing emails
UPDATE tt_clients
SET email_domain = LOWER(SPLIT_PART(email, '@', 2))
WHERE email IS NOT NULL AND email LIKE '%@%' AND email_domain IS NULL;

-- 4. Table to track contact sync requests
CREATE TABLE IF NOT EXISTS tt_contact_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES tt_clients(id),
  domain TEXT NOT NULL,
  contacts_found INT DEFAULT 0,
  contacts_added INT DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  requested_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
