-- =============================================================================
-- MIGRATION v35 — Mocciaro Soft · Fase EMPRESAS
-- =============================================================================
-- Objetivo: extender tt_companies y crear tablas satélite para fiscalidad,
-- direcciones, bancos, representantes legales y documentos legales.
--
-- NO incluye:
--   - documentos comerciales (facturas, remitos, etc.)
--   - numeración documental
--   - plantillas PDF
--
-- Idempotente: puede correrse varias veces sin romper.
-- Orden: extensiones → ALTER tt_companies → CREATE tablas satélite
--        → triggers → RLS → precargas.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Extensiones
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Extender tt_companies
-- -----------------------------------------------------------------------------
-- Nota sobre colisiones:
--   - company_type YA EXISTE con semántica 'internal|customer|supplier' (v4).
--     Para la forma jurídica usamos la columna NUEVA legal_form.
--   - currency YA EXISTE (default 'EUR'). Agregamos default_currency como
--     alias forward-compatible y lo sincronizamos abajo.
--   - code_prefix, brand_color, logo_url YA EXISTEN (v20, v29).
-- -----------------------------------------------------------------------------

ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS establishment_date    DATE;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS legal_form            TEXT;
-- legal_form: 'SL'|'SA'|'SAS'|'SRL'|'LLC'|'CORP'|'SOLE_PROP'|'PARTNERSHIP'|'EIRL'|'COOP'|'OTHER'
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS primary_activity      TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS secondary_activities  TEXT[] DEFAULT '{}';
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS fiscal_year_start     TEXT DEFAULT '01-01';
-- fiscal_year_start formato MM-DD. Default calendario natural.
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS timezone              TEXT DEFAULT 'Europe/Madrid';
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS email_billing         TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS email_notifications   TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS default_currency      TEXT;
ALTER TABLE tt_companies ADD COLUMN IF NOT EXISTS secondary_currencies  TEXT[] DEFAULT '{}';

-- Sincronizamos default_currency con el currency existente (una sola vez).
UPDATE tt_companies
SET default_currency = currency
WHERE default_currency IS NULL AND currency IS NOT NULL;

-- Chequeos suaves (checks parciales para no romper datos legacy).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tt_companies_legal_form_chk') THEN
    ALTER TABLE tt_companies
      ADD CONSTRAINT tt_companies_legal_form_chk
      CHECK (legal_form IS NULL OR legal_form IN (
        'SL','SA','SAS','SRL','LLC','CORP','S_CORP','SOLE_PROP',
        'PARTNERSHIP','EIRL','COOP','AUTONOMO','MONOTRIBUTO','OTHER'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tt_companies_fiscal_year_start_chk') THEN
    ALTER TABLE tt_companies
      ADD CONSTRAINT tt_companies_fiscal_year_start_chk
      CHECK (fiscal_year_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
  END IF;
END$$;

-- Índices adicionales
CREATE INDEX IF NOT EXISTS idx_tt_companies_legal_form ON tt_companies(legal_form);
CREATE INDEX IF NOT EXISTS idx_tt_companies_default_currency ON tt_companies(default_currency);


-- -----------------------------------------------------------------------------
-- 2. tt_country_fiscal_schemas
-- -----------------------------------------------------------------------------
-- Diccionario de qué campos fiscales requiere cada país. Lee la UI para
-- renderizar dinámicamente el tab "Fiscalidad" del wizard.
-- Estructura del JSONB `fields`: array de descriptores
--   { key, label, type, required, options?, group?, hint? }
--   type: 'text'|'select'|'boolean'|'date'|'array'|'number'
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tt_country_fiscal_schemas (
  country_code   CHAR(2) PRIMARY KEY,
  country_name   TEXT NOT NULL,
  tax_authority  TEXT NOT NULL,
  tax_id_label   TEXT NOT NULL,
  tax_id_regex   TEXT,
  currency_default TEXT NOT NULL,
  fields         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Precarga países. Upsert para que re-corridas actualicen el schema.
INSERT INTO tt_country_fiscal_schemas (country_code, country_name, tax_authority, tax_id_label, tax_id_regex, currency_default, fields) VALUES

('ES', 'España', 'AEAT', 'NIF/CIF', '^[A-Z0-9]{9}$', 'EUR', '[
  {"key":"iva_regime","label":"Régimen IVA","type":"select","required":true,"options":["general","simplificado","recargo_equivalencia","agricultura","no_sujeto"],"group":"iva"},
  {"key":"sii_enabled","label":"Acogido a SII","type":"boolean","required":false,"group":"iva","hint":"Suministro Inmediato de Información"},
  {"key":"verifactu_enabled","label":"Verifactu","type":"boolean","required":false,"group":"iva","hint":"Sistema AEAT desde 2026"},
  {"key":"ticketbai_enabled","label":"TicketBAI","type":"boolean","required":false,"group":"pais_vasco","hint":"Solo País Vasco (Araba/Gipuzkoa/Bizkaia)"},
  {"key":"ticketbai_territory","label":"Territorio TicketBAI","type":"select","required":false,"options":["araba","gipuzkoa","bizkaia"],"group":"pais_vasco"},
  {"key":"cnae_code","label":"CNAE","type":"text","required":true,"group":"actividad"},
  {"key":"iae_epigrafe","label":"Epígrafe IAE","type":"text","required":false,"group":"actividad"},
  {"key":"rega_number","label":"Registro General Actividades (REGA)","type":"text","required":false,"group":"registros"},
  {"key":"mercantile_registry","label":"Registro Mercantil","type":"text","required":false,"group":"registros"},
  {"key":"mercantile_province","label":"Provincia del Registro","type":"text","required":false,"group":"registros"},
  {"key":"social_capital","label":"Capital social (EUR)","type":"number","required":false,"group":"societario"}
]'::jsonb),

('AR', 'Argentina', 'AFIP', 'CUIT', '^\d{2}-?\d{8}-?\d{1}$', 'ARS', '[
  {"key":"iva_condition","label":"Condición IVA","type":"select","required":true,"options":["responsable_inscripto","monotributo","exento","consumidor_final","no_inscripto"],"group":"iva"},
  {"key":"monotributo_category","label":"Categoría Monotributo","type":"select","required":false,"options":["A","B","C","D","E","F","G","H","I","J","K"],"group":"iva","hint":"Solo si monotributo"},
  {"key":"iibb_type","label":"Tipo IIBB","type":"select","required":true,"options":["local","convenio_multilateral","exento","no_aplica"],"group":"iibb"},
  {"key":"iibb_number","label":"Nº Inscripción IIBB","type":"text","required":false,"group":"iibb"},
  {"key":"iibb_jurisdiction","label":"Jurisdicción IIBB","type":"text","required":false,"group":"iibb","hint":"CABA, Buenos Aires, etc."},
  {"key":"iibb_cm_coefficient","label":"Coeficiente Convenio Multilateral","type":"number","required":false,"group":"iibb"},
  {"key":"iibb_cm_jurisdictions","label":"Jurisdicciones CM","type":"array","required":false,"group":"iibb"},
  {"key":"activity_start_date","label":"Inicio actividades AFIP","type":"date","required":false,"group":"actividad"},
  {"key":"afip_activity_code","label":"Código actividad AFIP","type":"text","required":true,"group":"actividad"},
  {"key":"retention_agent_iva","label":"Agente retención IVA","type":"boolean","required":false,"group":"retenciones"},
  {"key":"retention_agent_iibb","label":"Agente retención IIBB","type":"boolean","required":false,"group":"retenciones"}
]'::jsonb),

('US', 'United States', 'IRS', 'EIN', '^\d{2}-?\d{7}$', 'USD', '[
  {"key":"entity_type","label":"Entity type","type":"select","required":true,"options":["LLC","CORP","S_CORP","PARTNERSHIP","SOLE_PROP"],"group":"identidad"},
  {"key":"state","label":"State","type":"select","required":true,"options":["FL","CA","NY","TX","DE","NV","WY","OTHER"],"group":"identidad"},
  {"key":"state_tax_id","label":"State Tax ID","type":"text","required":false,"group":"identidad"},
  {"key":"sales_tax_permit","label":"Sales Tax Permit","type":"text","required":false,"group":"impuestos"},
  {"key":"ein_confirmed_date","label":"EIN confirmation date","type":"date","required":false,"group":"impuestos"},
  {"key":"annual_report_due","label":"Annual Report due date","type":"date","required":false,"group":"registros","hint":"FL: May 1st"},
  {"key":"registered_agent_name","label":"Registered Agent name","type":"text","required":false,"group":"registros"},
  {"key":"registered_agent_address","label":"Registered Agent address","type":"text","required":false,"group":"registros"},
  {"key":"duns_number","label":"DUNS Number","type":"text","required":false,"group":"registros"}
]'::jsonb),

('MX', 'México', 'SAT', 'RFC', '^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$', 'MXN', '[
  {"key":"regime_sat","label":"Régimen fiscal SAT","type":"select","required":true,"options":["601_general","603_personas_morales_sin_fines","605_sueldos","606_arrendamiento","612_personas_fisicas","621_incorporacion","626_resico","OTHER"],"group":"iva"},
  {"key":"cfdi_use_default","label":"Uso CFDI default","type":"select","required":false,"options":["G01","G02","G03","P01","D01","OTHER"],"group":"cfdi"},
  {"key":"fiscal_zip_code","label":"CP fiscal (CFDI 4.0)","type":"text","required":true,"group":"cfdi"},
  {"key":"fiel_status","label":"FIEL activa","type":"boolean","required":false,"group":"certificados"},
  {"key":"ciec_registered","label":"CIEC registrada","type":"boolean","required":false,"group":"certificados"}
]'::jsonb),

('BR', 'Brasil', 'Receita Federal', 'CNPJ', '^\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}$', 'BRL', '[
  {"key":"inscricao_estadual","label":"Inscrição Estadual","type":"text","required":true,"group":"estadual"},
  {"key":"inscricao_municipal","label":"Inscrição Municipal","type":"text","required":false,"group":"municipal"},
  {"key":"cnae_principal","label":"CNAE principal","type":"text","required":true,"group":"actividad"},
  {"key":"cnae_secondary","label":"CNAE secundarios","type":"array","required":false,"group":"actividad"},
  {"key":"regime_tributario","label":"Regime tributário","type":"select","required":true,"options":["simples_nacional","lucro_presumido","lucro_real","mei"],"group":"iva"},
  {"key":"optante_simples","label":"Optante Simples Nacional","type":"boolean","required":false,"group":"iva"}
]'::jsonb),

('CL', 'Chile', 'SII', 'RUT', '^\d{1,8}-[\dkK]$', 'CLP', '[
  {"key":"giro","label":"Giro","type":"text","required":true,"group":"actividad"},
  {"key":"activity_start_sii","label":"Inicio actividades SII","type":"date","required":false,"group":"actividad"},
  {"key":"sii_regime","label":"Régimen SII","type":"select","required":true,"options":["pro_pyme_transparente","pro_pyme_general","general","renta_presunta"],"group":"iva"},
  {"key":"retenedor","label":"Agente retenedor","type":"boolean","required":false,"group":"retenciones"}
]'::jsonb),

('UY', 'Uruguay', 'DGI', 'RUT', '^\d{12}$', 'UYU', '[
  {"key":"giro","label":"Giro","type":"text","required":true,"group":"actividad"},
  {"key":"cede_group","label":"Grupo CEDE (grandes contribuyentes)","type":"boolean","required":false,"group":"iva"},
  {"key":"regime","label":"Régimen","type":"select","required":true,"options":["general","imeba","literal_e","monotributo"],"group":"iva"},
  {"key":"bps_registered","label":"Inscripto BPS","type":"boolean","required":false,"group":"seguridad_social"}
]'::jsonb)

ON CONFLICT (country_code) DO UPDATE
SET country_name      = EXCLUDED.country_name,
    tax_authority     = EXCLUDED.tax_authority,
    tax_id_label      = EXCLUDED.tax_id_label,
    tax_id_regex      = EXCLUDED.tax_id_regex,
    currency_default  = EXCLUDED.currency_default,
    fields            = EXCLUDED.fields,
    updated_at        = NOW();


-- -----------------------------------------------------------------------------
-- 3. tt_company_fiscal_profiles  (1:1 con tt_companies)
-- -----------------------------------------------------------------------------
-- Datos fiscales específicos por país guardados en JSONB validado por
-- tt_country_fiscal_schemas.fields. Uno por empresa.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tt_company_fiscal_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL UNIQUE REFERENCES tt_companies(id) ON DELETE CASCADE,
  country_code   CHAR(2) NOT NULL REFERENCES tt_country_fiscal_schemas(country_code),
  tax_id         TEXT,
  tax_id_type    TEXT,
  data           JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_complete    BOOLEAN NOT NULL DEFAULT false,
  last_validated_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tt_company_fiscal_profiles_country
  ON tt_company_fiscal_profiles(country_code);


-- -----------------------------------------------------------------------------
-- 4. tt_company_addresses  (N por empresa)
-- -----------------------------------------------------------------------------
-- kind: fiscal | billing | shipping | warehouse | branch
-- Una fiscal por empresa (partial unique index).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tt_company_addresses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  label          TEXT,
  line1          TEXT NOT NULL,
  line2          TEXT,
  city           TEXT NOT NULL,
  state          TEXT,
  postal_code    TEXT,
  country_code   CHAR(2) NOT NULL,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  geo_lat        NUMERIC(10,7),
  geo_lng        NUMERIC(10,7),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tt_company_addresses_kind_chk
    CHECK (kind IN ('fiscal','billing','shipping','warehouse','branch'))
);

CREATE INDEX IF NOT EXISTS idx_tt_company_addresses_company
  ON tt_company_addresses(company_id);
CREATE INDEX IF NOT EXISTS idx_tt_company_addresses_kind
  ON tt_company_addresses(company_id, kind);

-- Solo una dirección fiscal por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_tt_company_addresses_one_fiscal
  ON tt_company_addresses(company_id)
  WHERE kind = 'fiscal';

-- Solo una default por kind (evita dos shipping default, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tt_company_addresses_one_default_per_kind
  ON tt_company_addresses(company_id, kind)
  WHERE is_default = true;


-- -----------------------------------------------------------------------------
-- 5. tt_company_bank_accounts  (N por empresa)
-- -----------------------------------------------------------------------------
-- Soporta IBAN (ES/EU), CBU/alias (AR), ACH/routing (US), PIX/CNPJ (BR),
-- CLABE (MX). Los campos específicos se guardan en JSONB `routing_details`.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tt_company_bank_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  label            TEXT,
  bank_name        TEXT NOT NULL,
  account_type     TEXT NOT NULL DEFAULT 'checking',
  account_number   TEXT NOT NULL,
  currency         TEXT NOT NULL,
  country_code     CHAR(2) NOT NULL,
  iban             TEXT,
  swift_bic        TEXT,
  cbu              TEXT,
  alias_cbu        TEXT,
  routing_number   TEXT,
  ach_type         TEXT,
  clabe            TEXT,
  pix_key          TEXT,
  pix_key_type     TEXT,
  holder_name      TEXT,
  holder_tax_id    TEXT,
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  routing_details  JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tt_company_bank_accounts_account_type_chk
    CHECK (account_type IN ('checking','savings','payroll','usd','other'))
);

CREATE INDEX IF NOT EXISTS idx_tt_company_bank_accounts_company
  ON tt_company_bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_tt_company_bank_accounts_currency
  ON tt_company_bank_accounts(company_id, currency);

-- Solo una primary por moneda
CREATE UNIQUE INDEX IF NOT EXISTS uq_tt_company_bank_accounts_one_primary_per_currency
  ON tt_company_bank_accounts(company_id, currency)
  WHERE is_primary = true AND is_active = true;


-- -----------------------------------------------------------------------------
-- 6. tt_company_currencies  (N por empresa, maestro de monedas operativas)
-- -----------------------------------------------------------------------------
-- Duplica intencionalmente secondary_currencies[] en tt_companies pero con
-- metadatos (rate fija, tipo de cambio override, prioridad). Puede quedar
-- vacía y el sistema usa los arrays de tt_companies como fallback.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tt_company_currencies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  currency_code     TEXT NOT NULL,
  is_default        BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  manual_rate       NUMERIC(18,8),
  rate_source       TEXT,
  priority          INT NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tt_company_currencies_uq UNIQUE (company_id, currency_code),
  CONSTRAINT tt_company_currencies_rate_source_chk
    CHECK (rate_source IS NULL OR rate_source IN ('manual','afip_api','ecb','bcra','banxico','live_feed'))
);

CREATE INDEX IF NOT EXISTS idx_tt_company_currencies_company
  ON tt_company_currencies(company_id);

-- Solo una default por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_tt_company_currencies_one_default
  ON tt_company_currencies(company_id)
  WHERE is_default = true;


-- -----------------------------------------------------------------------------
-- 7. tt_company_legal_representatives  (N por empresa)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tt_company_legal_representatives (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  full_name          TEXT NOT NULL,
  role               TEXT NOT NULL,
  tax_id             TEXT,
  tax_id_type        TEXT,
  nationality        CHAR(2),
  birth_date         DATE,
  appointment_date   DATE,
  end_date           DATE,
  signing_authority  BOOLEAN NOT NULL DEFAULT false,
  powers_scope       TEXT,
  email              TEXT,
  phone              TEXT,
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tt_company_legal_reps_role_chk
    CHECK (role IN (
      'administrador_unico','administrador_solidario','administrador_mancomunado',
      'presidente','director','apoderado','socio','ceo','cfo','representante_legal',
      'autorizado_firma','other'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tt_company_legal_reps_company
  ON tt_company_legal_representatives(company_id);
CREATE INDEX IF NOT EXISTS idx_tt_company_legal_reps_active
  ON tt_company_legal_representatives(company_id, is_active);


-- -----------------------------------------------------------------------------
-- 8. tt_company_documents  (N por empresa — PDFs, imágenes, certificados)
-- -----------------------------------------------------------------------------
-- storage_path apunta al bucket de Supabase Storage. La autenticidad y
-- expiración se validan por metadatos aquí, no por filename.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tt_company_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  doc_kind         TEXT NOT NULL,
  label            TEXT NOT NULL,
  description      TEXT,
  storage_bucket   TEXT NOT NULL DEFAULT 'company-documents',
  storage_path     TEXT NOT NULL,
  mime_type        TEXT,
  size_bytes       BIGINT,
  checksum_sha256  TEXT,
  issued_at        DATE,
  expires_at       DATE,
  issuing_authority TEXT,
  reference_number TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by      UUID REFERENCES tt_users(id) ON DELETE SET NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tt_company_documents_doc_kind_chk
    CHECK (doc_kind IN (
      'escritura_constitutiva','estatutos','poderes','alta_fiscal',
      'certificado_digital','firma_electronica','ticketbai_cert',
      'registro_mercantil','cuit_constancia','iibb_constancia',
      'ein_letter','articles_of_incorporation','operating_agreement',
      'cfdi_csd','rfc_constancia','cnpj_card','sintegra','rut_constancia',
      'logo','banner','signature_image','id_document','passport',
      'contract','addendum','other'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tt_company_documents_company
  ON tt_company_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_tt_company_documents_kind
  ON tt_company_documents(company_id, doc_kind);
CREATE INDEX IF NOT EXISTS idx_tt_company_documents_expires
  ON tt_company_documents(expires_at)
  WHERE expires_at IS NOT NULL AND is_active = true;


-- -----------------------------------------------------------------------------
-- 9. Trigger updated_at para todas las nuevas tablas
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'tt_country_fiscal_schemas',
    'tt_company_fiscal_profiles',
    'tt_company_addresses',
    'tt_company_bank_accounts',
    'tt_company_currencies',
    'tt_company_legal_representatives',
    'tt_company_documents'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW
         EXECUTE FUNCTION fn_set_updated_at()',
      t, t
    );
  END LOOP;
END$$;


-- -----------------------------------------------------------------------------
-- 10. RLS — permisiva mínima (autenticados). Afinar por rol en v36+.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'tt_country_fiscal_schemas',
    'tt_company_fiscal_profiles',
    'tt_company_addresses',
    'tt_company_bank_accounts',
    'tt_company_currencies',
    'tt_company_legal_representatives',
    'tt_company_documents'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      t || '_read', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t || '_write', t
    );
  END LOOP;
END$$;


-- -----------------------------------------------------------------------------
-- 11. Storage bucket para documentos (si no existe)
-- -----------------------------------------------------------------------------
-- Nota: en Supabase gestionado, storage.buckets suele crearse vía API.
-- Dejamos el INSERT condicional por si se corre con service role.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('company-documents', 'company-documents', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 12. Precarga de las 4 empresas existentes
-- -----------------------------------------------------------------------------
-- Crea fiscal_profile vacío para cada empresa internal existente,
-- alineado con su country actual. Idempotente: solo inserta si no existe.
-- -----------------------------------------------------------------------------

INSERT INTO tt_company_fiscal_profiles (company_id, country_code, tax_id, tax_id_type, data, is_complete)
SELECT c.id,
       UPPER(COALESCE(c.country, 'ES'))::char(2),
       c.tax_id,
       c.tax_id_type,
       '{}'::jsonb,
       false
FROM tt_companies c
LEFT JOIN tt_company_fiscal_profiles fp ON fp.company_id = c.id
WHERE fp.id IS NULL
  AND UPPER(COALESCE(c.country, 'ES')) IN (
    SELECT country_code FROM tt_country_fiscal_schemas
  );

-- Precarga dirección fiscal desde los campos legacy si no hay ninguna cargada.
INSERT INTO tt_company_addresses (company_id, kind, line1, city, postal_code, country_code, is_default)
SELECT c.id,
       'fiscal',
       COALESCE(NULLIF(c.address,''), '—'),
       COALESCE(NULLIF(c.city,''), '—'),
       NULLIF(c.postal_code,''),
       UPPER(COALESCE(c.country,'ES'))::char(2),
       true
FROM tt_companies c
LEFT JOIN tt_company_addresses a ON a.company_id = c.id AND a.kind = 'fiscal'
WHERE a.id IS NULL;

-- Precarga cuenta bancaria desde iban si existe y no hay ninguna.
INSERT INTO tt_company_bank_accounts (
  company_id, bank_name, account_number, iban, swift_bic,
  currency, country_code, is_primary
)
SELECT c.id,
       '—',
       c.iban,
       c.iban,
       c.swift,
       COALESCE(c.default_currency, c.currency, 'EUR'),
       UPPER(COALESCE(c.country,'ES'))::char(2),
       true
FROM tt_companies c
LEFT JOIN tt_company_bank_accounts b ON b.company_id = c.id
WHERE b.id IS NULL
  AND c.iban IS NOT NULL
  AND LENGTH(TRIM(c.iban)) > 0;

-- Precarga default_currency en tt_company_currencies
INSERT INTO tt_company_currencies (company_id, currency_code, is_default, is_active, priority)
SELECT c.id,
       COALESCE(c.default_currency, c.currency, 'EUR'),
       true,
       true,
       0
FROM tt_companies c
LEFT JOIN tt_company_currencies cc
  ON cc.company_id = c.id
 AND cc.currency_code = COALESCE(c.default_currency, c.currency, 'EUR')
WHERE cc.id IS NULL;


-- -----------------------------------------------------------------------------
-- 13. Verificación rápida (comentada, descomentá para debug)
-- -----------------------------------------------------------------------------
-- SELECT c.name, c.country, fp.country_code, fp.is_complete
-- FROM tt_companies c
-- LEFT JOIN tt_company_fiscal_profiles fp ON fp.company_id = c.id;

COMMIT;

-- =============================================================================
-- FIN migration v35
-- =============================================================================
