-- ================================================================
-- MIGRATION V47 — WhatsApp Business Cloud API (Meta) — Multi-empresa
-- ================================================================
-- Cada empresa del grupo puede tener 0, 1 o varios numeros de
-- WhatsApp asociados. Cada numero guarda sus propias credenciales
-- (phone_number_id, WABA id, access_token, app_secret, verify token).
--
-- Mensajes entrantes y salientes se almacenan en tt_whatsapp_messages
-- con enlace opcional a entidades del ERP (cliente, cotizacion, etc).
--
-- RLS: solo usuarios con acceso a la empresa pueden leer sus cuentas.
--      Solo admins pueden modificar credenciales.
--      El webhook publico usa service_role (bypassea RLS).
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) TABLA: tt_company_whatsapp_accounts
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_company_whatsapp_accounts (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,

  -- Identidad del numero
  display_name                  text NOT NULL,
  phone_number                  text NOT NULL,             -- E.164, ej +34600123456
  phone_number_id               text NOT NULL,             -- ID del numero en Meta
  whatsapp_business_account_id  text NOT NULL,             -- WABA id
  business_name                 text,                      -- nombre comercial (opcional)

  -- Credenciales (guardadas en claro — RLS restrictivo las protege)
  access_token                  text NOT NULL,             -- permanent token o system user token
  access_token_last4            text,                      -- para mostrar en UI sin exponer el full token
  app_secret                    text NOT NULL,             -- para verificar firmas X-Hub-Signature-256
  webhook_verify_token          text NOT NULL,             -- se configura en Meta y se valida en GET webhook

  -- Webhook config
  webhook_path                  text NOT NULL UNIQUE,      -- ej: "tt-es-prod" -> /api/whatsapp/webhook/tt-es-prod

  -- Estado
  is_default                    boolean NOT NULL DEFAULT false,  -- cuenta por defecto de la empresa
  active                        boolean NOT NULL DEFAULT true,
  verification_status           text NOT NULL DEFAULT 'pending', -- pending | verified | error
  last_verified_at              timestamptz,
  last_error                    text,

  -- Auditoria
  created_by                    uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tt_whatsapp_accounts_verification_status_check
    CHECK (verification_status IN ('pending', 'verified', 'error'))
);

-- Solo una cuenta default por empresa (garantiza unicidad del default)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_accounts_default_per_company
  ON tt_company_whatsapp_accounts(company_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_company
  ON tt_company_whatsapp_accounts(company_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_webhook_path
  ON tt_company_whatsapp_accounts(webhook_path);

COMMENT ON TABLE tt_company_whatsapp_accounts IS
  'Credenciales de WhatsApp Business Cloud API (Meta) por empresa. Cada empresa puede tener varios numeros.';
COMMENT ON COLUMN tt_company_whatsapp_accounts.webhook_path IS
  'Slug unico para construir la URL publica: https://APP/api/whatsapp/webhook/<webhook_path>';
COMMENT ON COLUMN tt_company_whatsapp_accounts.app_secret IS
  'App Secret de la app de Meta (NO del access token). Se usa para verificar firmas X-Hub-Signature-256.';


-- ----------------------------------------------------------------
-- 2) TABLA: tt_whatsapp_messages
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_whatsapp_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  account_id            uuid REFERENCES tt_company_whatsapp_accounts(id) ON DELETE SET NULL,

  direction             text NOT NULL,                     -- inbound | outbound
  wa_message_id         text,                              -- id que devuelve Meta
  from_phone            text NOT NULL,                     -- E.164
  to_phone              text NOT NULL,

  message_type          text NOT NULL DEFAULT 'text',      -- text | image | document | audio | video | template | location | sticker | button | interactive
  template_name         text,
  template_language     text,
  template_params       jsonb,
  body                  text,                              -- texto plano (si aplica)
  media_url             text,
  media_mime_type       text,
  media_caption         text,

  status                text NOT NULL DEFAULT 'queued',    -- queued | sent | delivered | read | failed | received
  status_updated_at     timestamptz,
  error_code            text,
  error_message         text,

  -- Vinculacion con el ERP
  client_id             uuid REFERENCES tt_clients(id) ON DELETE SET NULL,
  lead_id               uuid REFERENCES tt_leads(id) ON DELETE SET NULL,
  related_entity_type   text,                              -- quote | invoice | order | sat_ticket | ...
  related_entity_id     uuid,

  sent_by               uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload           jsonb,                             -- payload original de Meta (auditoria)

  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tt_whatsapp_messages_direction_check
    CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT tt_whatsapp_messages_status_check
    CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_created
  ON tt_whatsapp_messages(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_account
  ON tt_whatsapp_messages(account_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client
  ON tt_whatsapp_messages(client_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead
  ON tt_whatsapp_messages(lead_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id
  ON tt_whatsapp_messages(wa_message_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phones
  ON tt_whatsapp_messages(from_phone, to_phone);

COMMENT ON TABLE tt_whatsapp_messages IS
  'Log de mensajes WhatsApp (entrantes y salientes) por empresa.';


-- ----------------------------------------------------------------
-- 3) Trigger updated_at para accounts
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_whatsapp_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_accounts_updated_at ON tt_company_whatsapp_accounts;
CREATE TRIGGER trg_whatsapp_accounts_updated_at
  BEFORE UPDATE ON tt_company_whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION fn_whatsapp_accounts_updated_at();


-- ----------------------------------------------------------------
-- 4) RLS — tt_company_whatsapp_accounts
-- ----------------------------------------------------------------
ALTER TABLE tt_company_whatsapp_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_accounts_service_role ON tt_company_whatsapp_accounts;
DROP POLICY IF EXISTS whatsapp_accounts_select       ON tt_company_whatsapp_accounts;
DROP POLICY IF EXISTS whatsapp_accounts_insert       ON tt_company_whatsapp_accounts;
DROP POLICY IF EXISTS whatsapp_accounts_update       ON tt_company_whatsapp_accounts;
DROP POLICY IF EXISTS whatsapp_accounts_delete       ON tt_company_whatsapp_accounts;

-- Service role (endpoints server-side, webhook publico): acceso total
CREATE POLICY whatsapp_accounts_service_role ON tt_company_whatsapp_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Usuarios autenticados con acceso a la empresa: SELECT
CREATE POLICY whatsapp_accounts_select ON tt_company_whatsapp_accounts
  FOR SELECT TO authenticated
  USING (fn_user_has_company_access(company_id));

-- Solo admin de la empresa puede crear
CREATE POLICY whatsapp_accounts_insert ON tt_company_whatsapp_accounts
  FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin_user() AND fn_user_has_company_access(company_id));

-- Solo admin de la empresa puede modificar
CREATE POLICY whatsapp_accounts_update ON tt_company_whatsapp_accounts
  FOR UPDATE TO authenticated
  USING (fn_is_admin_user() AND fn_user_has_company_access(company_id))
  WITH CHECK (fn_is_admin_user() AND fn_user_has_company_access(company_id));

-- Solo admin de la empresa puede borrar
CREATE POLICY whatsapp_accounts_delete ON tt_company_whatsapp_accounts
  FOR DELETE TO authenticated
  USING (fn_is_admin_user() AND fn_user_has_company_access(company_id));


-- ----------------------------------------------------------------
-- 5) RLS — tt_whatsapp_messages
-- ----------------------------------------------------------------
ALTER TABLE tt_whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_messages_service_role ON tt_whatsapp_messages;
DROP POLICY IF EXISTS whatsapp_messages_select       ON tt_whatsapp_messages;
DROP POLICY IF EXISTS whatsapp_messages_insert       ON tt_whatsapp_messages;
DROP POLICY IF EXISTS whatsapp_messages_update       ON tt_whatsapp_messages;

CREATE POLICY whatsapp_messages_service_role ON tt_whatsapp_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Usuarios de la empresa: leen los mensajes de SU empresa
CREATE POLICY whatsapp_messages_select ON tt_whatsapp_messages
  FOR SELECT TO authenticated
  USING (fn_user_has_company_access(company_id));

-- Usuarios con acceso pueden registrar envios desde la UI
CREATE POLICY whatsapp_messages_insert ON tt_whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (fn_user_has_company_access(company_id));

CREATE POLICY whatsapp_messages_update ON tt_whatsapp_messages
  FOR UPDATE TO authenticated
  USING (fn_user_has_company_access(company_id))
  WITH CHECK (fn_user_has_company_access(company_id));


-- ----------------------------------------------------------------
-- 6) Helper RPC: obtener cuenta default de la empresa activa
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_whatsapp_account_default(p_company_id uuid)
RETURNS uuid
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tt_company_whatsapp_accounts
   WHERE company_id = p_company_id
     AND active = true
   ORDER BY is_default DESC, created_at ASC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION fn_whatsapp_account_default(uuid) TO authenticated;


COMMIT;

-- ================================================================
-- NOTAS DE ACTIVACION (no ejecutar, solo referencia)
-- ================================================================
-- 1) En Meta for Developers -> Crear App tipo "Business"
-- 2) Agregar producto "WhatsApp" a la app.
-- 3) Comprar o migrar el numero al WABA.
-- 4) Configurar webhook:
--    URL:   https://TU-APP.vercel.app/api/whatsapp/webhook/<webhook_path>
--    Token: <webhook_verify_token>  (debe coincidir con el guardado)
--    Subscribe campos: messages, message_template_status_update
-- 5) Generar System User token permanente en Business Manager (no
--    uses tokens temporales de 24hs).
-- 6) Obtener App Secret desde Settings -> Basic de la App.
-- 7) Cargar todo en /admin/whatsapp y probar conexion.
-- ================================================================
