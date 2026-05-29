-- v85 compat: tt_document_sends ya existía con otra estructura. ALTER + crear tt_document_share_links.

-- 1) Agregar columnas faltantes a tt_document_sends
ALTER TABLE tt_document_sends ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES tt_companies(id);
ALTER TABLE tt_document_sends ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE tt_document_sends ADD COLUMN IF NOT EXISTS share_link_id UUID;
ALTER TABLE tt_document_sends ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tt_document_sends ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) Indexes (ahora company_id ya existe)
CREATE INDEX IF NOT EXISTS idx_document_sends_document     ON tt_document_sends(document_id);
CREATE INDEX IF NOT EXISTS idx_document_sends_company      ON tt_document_sends(company_id);
CREATE INDEX IF NOT EXISTS idx_document_sends_tracking     ON tt_document_sends(tracking_id);
CREATE INDEX IF NOT EXISTS idx_document_sends_sent_at      ON tt_document_sends(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_sends_channel      ON tt_document_sends(channel);

-- 3) RLS (idempotente)
ALTER TABLE tt_document_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tt_document_sends_auth ON tt_document_sends;
CREATE POLICY tt_document_sends_auth ON tt_document_sends
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4) Crear tt_document_share_links (esta no existe)
CREATE TABLE IF NOT EXISTS tt_document_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL REFERENCES tt_documents(id) ON DELETE CASCADE,
  company_id       UUID REFERENCES tt_companies(id),
  client_id        UUID REFERENCES tt_clients(id),
  token            TEXT NOT NULL UNIQUE,
  token_hash       TEXT,
  expires_at       TIMESTAMPTZ,
  password         TEXT,
  open_count       INTEGER NOT NULL DEFAULT 0,
  first_opened_at  TIMESTAMPTZ,
  last_opened_at   TIMESTAMPTZ,
  last_ip          INET,
  last_user_agent  TEXT,
  revoked          BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID REFERENCES tt_users(id),
  created_by       UUID REFERENCES tt_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_document ON tt_document_share_links(document_id);
CREATE INDEX IF NOT EXISTS idx_share_links_company  ON tt_document_share_links(company_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token    ON tt_document_share_links(token);

ALTER TABLE tt_document_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tt_share_links_auth ON tt_document_share_links;
CREATE POLICY tt_share_links_auth ON tt_document_share_links
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 5) FK diferida desde tt_document_sends.share_link_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tt_document_sends_share_link_fk'
  ) THEN
    ALTER TABLE tt_document_sends
      ADD CONSTRAINT tt_document_sends_share_link_fk
      FOREIGN KEY (share_link_id) REFERENCES tt_document_share_links(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6) Helpers RPC
CREATE OR REPLACE FUNCTION tt_increment_send_open(p_tracking_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tt_document_sends
     SET open_count       = open_count + 1,
         last_opened_at   = NOW(),
         first_opened_at  = COALESCE(first_opened_at, NOW()),
         delivery_status  = CASE
                              WHEN delivery_status IN ('sent','delivered') THEN 'opened'
                              ELSE delivery_status
                            END
   WHERE tracking_id = p_tracking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION tt_increment_send_open(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION tt_increment_share_link_open(p_token TEXT, p_ip INET, p_ua TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tt_document_share_links
     SET open_count      = open_count + 1,
         last_opened_at  = NOW(),
         first_opened_at = COALESCE(first_opened_at, NOW()),
         last_ip         = COALESCE(p_ip, last_ip),
         last_user_agent = COALESCE(p_ua, last_user_agent)
   WHERE token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION tt_increment_share_link_open(TEXT, INET, TEXT) TO anon, authenticated;
