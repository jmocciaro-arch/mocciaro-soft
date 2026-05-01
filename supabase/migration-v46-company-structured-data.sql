-- ================================================================
-- MIGRATION V46 — Datos estructurados de empresa
-- Reemplaza dirección en texto libre por campos diferenciados.
-- Reemplaza datos bancarios en textarea por tabla dedicada multi-cuenta.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) Dirección estructurada en tt_companies
-- ----------------------------------------------------------------
ALTER TABLE tt_companies
  ADD COLUMN IF NOT EXISTS address_street       text,        -- Calle / vía
  ADD COLUMN IF NOT EXISTS address_number       text,        -- Número
  ADD COLUMN IF NOT EXISTS address_floor        text,        -- Piso
  ADD COLUMN IF NOT EXISTS address_apartment    text,        -- Departamento / unidad
  ADD COLUMN IF NOT EXISTS address_postal_code  text,        -- CP / ZIP
  ADD COLUMN IF NOT EXISTS address_city         text,        -- Ciudad / localidad
  ADD COLUMN IF NOT EXISTS address_state        text,        -- Provincia / estado / región
  ADD COLUMN IF NOT EXISTS address_references   text,        -- Entre calles / referencias
  ADD COLUMN IF NOT EXISTS address_lat          numeric(10,7),  -- coordenadas opcionales
  ADD COLUMN IF NOT EXISTS address_lng          numeric(10,7);

-- ----------------------------------------------------------------
-- 2) Tabla de cuentas bancarias (múltiples por empresa)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_company_bank_accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  -- Identificación amigable
  alias                    text NOT NULL,                          -- ej "Galicia EUR principal"
  bank_name                text NOT NULL,                          -- ej "Banco Santander"
  bank_country             text,                                   -- ISO 2 letras del país del banco
  -- Titular
  account_holder           text NOT NULL,
  account_holder_tax_id    text,                                   -- CUIT / CIF / EIN del titular
  -- Tipo y moneda
  account_type             text CHECK (account_type IN ('checking','savings','business','other')),
  currency                 text NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS','EUR','USD','GBP','BRL','CLP','UYU')),
  -- Identificadores (varían por país)
  iban                     text,                                   -- España / Europa: ESxx xxxx xxxx xxxx xxxx xxxx
  bic_swift                text,                                   -- Internacional: 8 u 11 caracteres
  cbu                      text,                                   -- Argentina: 22 dígitos
  cbu_alias                text,                                   -- Argentina: alias
  account_number           text,                                   -- USA / genérico
  routing_number           text,                                   -- USA ABA: 9 dígitos
  -- Estado
  is_default               boolean NOT NULL DEFAULT false,         -- cuenta principal de la empresa
  is_active                boolean NOT NULL DEFAULT true,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  -- Sólo una cuenta default por empresa+moneda
  CONSTRAINT uq_default_per_currency UNIQUE NULLS NOT DISTINCT (company_id, currency, is_default)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company  ON tt_company_bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_currency ON tt_company_bank_accounts(currency);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active   ON tt_company_bank_accounts(is_active) WHERE is_active;

-- ----------------------------------------------------------------
-- 3) Migrar datos legacy
-- Si existe la columna `address` (texto plano), copiarla a address_references temporalmente
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tt_companies' AND column_name = 'address') THEN
    UPDATE tt_companies
    SET address_references = COALESCE(address_references, address)
    WHERE address IS NOT NULL AND address <> '' AND address_street IS NULL;
  END IF;
END $$;

-- Si existe la columna `bank_details` legacy en tt_companies, dejarla por ahora
-- (se mostrará en el form como "datos legacy" hasta que el admin migre a la nueva tabla)

-- ----------------------------------------------------------------
-- 4) RLS
-- ----------------------------------------------------------------
ALTER TABLE tt_company_bank_accounts ENABLE ROW LEVEL SECURITY;

DO $do$ BEGIN
  CREATE POLICY "bank_accounts_read" ON tt_company_bank_accounts FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "bank_accounts_write" ON tt_company_bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "bank_accounts_all"   ON tt_company_bank_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

NOTIFY pgrst, 'reload schema';
COMMIT;
