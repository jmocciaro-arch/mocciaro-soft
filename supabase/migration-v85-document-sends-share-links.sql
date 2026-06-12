-- ============================================================================
-- v85 — Send-document real: tracking, share links y sends por canal
-- ============================================================================
--
-- Tablas:
--   tt_document_sends         registro detallado de cada envío (multi-canal,
--                             multi-destinatario, con tracking de aperturas).
--   tt_document_share_links   tokens shareables para que el cliente abra el
--                             documento sin login (vía /doc/view/[id]).
--
-- Notas:
--   - Reemplaza/complementa a tt_email_log: este último sigue funcionando para
--     histórico simple, mientras que tt_document_sends guarda el detalle UI
--     que muestra el send-document-modal.
--   - share_link_id en tt_document_sends linkea al token compartido cuando el
--     envío es por canal 'link'.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- tt_document_sends
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tt_document_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Documento enviado
  document_id      UUID REFERENCES tt_documents(id) ON DELETE CASCADE,
  document_type    TEXT,
  document_ref     TEXT,
  company_id       UUID REFERENCES tt_companies(id),

  -- Envío
  channel          TEXT NOT NULL DEFAULT 'email',      -- email | link | whatsapp | pdf | excel | text | word
  format           TEXT NOT NULL DEFAULT 'pdf',        -- pdf | html | excel | word | text | link
  recipients       JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ email, name, type: 'to'|'cc'|'bcc' }, ...]
  subject          TEXT,
  message          TEXT,

  -- Tracking
  tracking_id      TEXT UNIQUE,
  delivery_status  TEXT NOT NULL DEFAULT 'sent',       -- sent | delivered | opened | clicked | bounced | failed
  open_count       INTEGER NOT NULL DEFAULT 0,
  first_opened_at  TIMESTAMPTZ,
  last_opened_at   TIMESTAMPTZ,
  link_clicks      JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ at, url }]
  error_message    TEXT,

  -- Share link (cuando channel = 'link')
  share_link              TEXT,
  share_link_id           UUID,                        -- FK to tt_document_share_links (added abajo)
  share_link_expires_at   TIMESTAMPTZ,
  share_link_password     TEXT,                        -- bcrypt/hash o plano si es simple

  -- Adjuntos del email
  attachments      JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ name, size, url? }]

  -- Auditoría
  sent_by          UUID REFERENCES tt_users(id),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata libre
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_document_sends_document     ON tt_document_sends(document_id);
CREATE INDEX IF NOT EXISTS idx_document_sends_company      ON tt_document_sends(company_id);
CREATE INDEX IF NOT EXISTS idx_document_sends_tracking     ON tt_document_sends(tracking_id);
CREATE INDEX IF NOT EXISTS idx_document_sends_sent_at      ON tt_document_sends(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_sends_channel      ON tt_document_sends(channel);

ALTER TABLE tt_document_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_document_sends_auth ON tt_document_sends;
CREATE POLICY tt_document_sends_auth ON tt_document_sends
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- tt_document_share_links
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tt_document_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  document_id      UUID NOT NULL REFERENCES tt_documents(id) ON DELETE CASCADE,
  company_id       UUID REFERENCES tt_companies(id),
  client_id        UUID REFERENCES tt_clients(id),

  -- Token (firmado o aleatorio) — el cliente lo recibe en la URL
  token            TEXT NOT NULL UNIQUE,
  token_hash       TEXT,                                 -- opcional: hash si almacenamos solo hash

  -- Expiración / control de acceso
  expires_at       TIMESTAMPTZ,
  password         TEXT,                                 -- opcional, en plano (link simple) o hash

  -- Tracking
  open_count       INTEGER NOT NULL DEFAULT 0,
  first_opened_at  TIMESTAMPTZ,
  last_opened_at   TIMESTAMPTZ,
  last_ip          INET,
  last_user_agent  TEXT,

  -- Vida útil del link
  revoked          BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID REFERENCES tt_users(id),

  -- Auditoría
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

-- FK diferida desde tt_document_sends.share_link_id
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


-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers RPC — incrementar open_count atómicamente
-- ─────────────────────────────────────────────────────────────────────────────
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
