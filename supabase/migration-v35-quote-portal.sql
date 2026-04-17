-- =====================================================
-- Migration v35: Quote Portal — Tokens, Comments, Signatures
-- =====================================================
-- Crea las tablas para el portal de aceptación de cotizaciones:
--   tt_quote_tokens   — tokens de acceso público por cotización
--   tt_quote_comments — comentarios cliente ↔ empresa en una cotización
-- También crea el bucket de storage para firmas digitales.
-- =====================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. tt_quote_tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tt_quote_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES tt_documents(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES tt_clients(id),
  company_id      UUID NOT NULL REFERENCES tt_companies(id),
  token           TEXT NOT NULL UNIQUE,
  email           TEXT,
  expires_at      TIMESTAMPTZ,
  -- tracking
  viewed_at       TIMESTAMPTZ,
  view_count      INTEGER NOT NULL DEFAULT 0,
  -- acceptance
  accepted_at     TIMESTAMPTZ,
  accepted_by     TEXT,          -- nombre de quien acepta
  signature_url   TEXT,          -- URL de la firma en storage
  -- rejection
  rejected_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- índices
CREATE INDEX IF NOT EXISTS idx_tt_quote_tokens_token        ON tt_quote_tokens(token);
CREATE INDEX IF NOT EXISTS idx_tt_quote_tokens_document_id  ON tt_quote_tokens(document_id);
CREATE INDEX IF NOT EXISTS idx_tt_quote_tokens_company_id   ON tt_quote_tokens(company_id);
CREATE INDEX IF NOT EXISTS idx_tt_quote_tokens_client_id    ON tt_quote_tokens(client_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. tt_quote_comments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tt_quote_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id      UUID REFERENCES tt_quote_tokens(id) ON DELETE CASCADE,
  document_id   UUID REFERENCES tt_documents(id),
  author_name   TEXT NOT NULL,
  author_email  TEXT,
  author_type   TEXT NOT NULL DEFAULT 'client',  -- 'client' | 'internal'
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tt_quote_comments_token_id    ON tt_quote_comments(token_id);
CREATE INDEX IF NOT EXISTS idx_tt_quote_comments_document_id ON tt_quote_comments(document_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — acceso público read-only por token (service role omite RLS)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tt_quote_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_quote_comments ENABLE ROW LEVEL SECURITY;

-- Los endpoints usan service_role, que bypasea RLS.
-- Creamos políticas permisivas para anon READ solo si se necesita en el futuro.
CREATE POLICY "public_read_token" ON tt_quote_tokens
  FOR SELECT
  USING (true);   -- filtro por token en la query

CREATE POLICY "public_read_comments" ON tt_quote_comments
  FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Storage bucket para firmas digitales
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-signatures',
  'quote-signatures',
  true,
  524288,   -- 512 KB máximo por firma
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Política de escritura pública (el token actúa de autenticación a nivel app)
CREATE POLICY "public_upload_signatures"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'quote-signatures');

CREATE POLICY "public_read_signatures"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'quote-signatures');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Forzar reload schema PostgREST
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
