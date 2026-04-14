-- =====================================================
-- Migration v9: Contact personal data + history support
-- =====================================================

-- Personal data fields (manual entry, never overwritten by sync)
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS personal_email TEXT;
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS personal_phone TEXT;
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS personal_whatsapp TEXT;
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS birthday TEXT;
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS linkedin TEXT;

-- Track data source (manual vs gmail sync)
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE tt_client_contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
