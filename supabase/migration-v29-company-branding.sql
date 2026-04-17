-- =====================================================
-- Migration v29: Branding por empresa (PDFs/emails)
-- =====================================================

ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#F97316';
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#1E2330';
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS email_main TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS bank_details TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS footer_note TEXT;

-- Seed defaults para las 4 empresas conocidas
UPDATE tt_companies SET
  brand_color = COALESCE(brand_color, '#F97316'),
  secondary_color = COALESCE(secondary_color, '#1E2330')
WHERE brand_color IS NULL;

NOTIFY pgrst, 'reload schema';
