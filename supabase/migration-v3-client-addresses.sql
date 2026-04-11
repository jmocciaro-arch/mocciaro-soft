-- =====================================================
-- TorqueTools ERP - Migration V3: Client Addresses
-- Run this in Supabase SQL Editor
-- =====================================================

-- Table for multiple delivery/billing addresses per client
CREATE TABLE IF NOT EXISTS tt_client_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES tt_clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,        -- "Planta Pilar", "Oficina Central", etc.
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'AR',
  is_default BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tt_client_addr_client ON tt_client_addresses(client_id);

-- RLS policies
ALTER TABLE tt_client_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Addresses readable" ON tt_client_addresses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Addresses manageable" ON tt_client_addresses
  FOR ALL TO authenticated USING (true);

-- Grant access for anon role (used by service role key)
GRANT ALL ON tt_client_addresses TO anon;
GRANT ALL ON tt_client_addresses TO authenticated;
GRANT ALL ON tt_client_addresses TO service_role;
