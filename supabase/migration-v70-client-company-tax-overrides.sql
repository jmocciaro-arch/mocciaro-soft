-- =====================================================
-- v70 — Overrides de configuración fiscal por (cliente, empresa)
-- =====================================================
-- Caso de uso: el mismo cliente (ej: MIRGOR S.A.) puede tener
-- régimen fiscal distinto según la empresa que vende:
--   - Vendido por TorqueTools AR  → IVA 21%
--   - Vendido por TorqueTools USA → IVA 0% (export)
--   - Vendido por TorqueTools ES  → IVA 0% (intracomunitario)
--
-- Esta tabla guarda OVERRIDES sobre los defaults de tt_clients
-- (que se siguen usando si no hay override para la combinación).
--
-- Lookup en código:
--   1. Si existe row para (client_id, company_id) → usar esos valores
--   2. Si no → fallback a tt_clients.subject_iva, iva_rate, etc.
-- =====================================================

CREATE TABLE IF NOT EXISTS tt_client_company_tax_config (
  client_id     UUID NOT NULL REFERENCES tt_clients(id)   ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,

  -- IVA
  subject_iva   BOOLEAN NOT NULL DEFAULT true,
  iva_rate      NUMERIC(5,2) NOT NULL DEFAULT 21,

  -- IRPF
  subject_irpf  BOOLEAN NOT NULL DEFAULT false,
  irpf_rate     NUMERIC(5,2) NOT NULL DEFAULT 15,

  -- Recargo de Equivalencia
  subject_re    BOOLEAN NOT NULL DEFAULT false,
  re_rate       NUMERIC(5,2) NOT NULL DEFAULT 5.2,

  -- Notas opcionales (ej: "Exento por exportación según Art. X")
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (client_id, company_id)
);

COMMENT ON TABLE  tt_client_company_tax_config IS
  'Overrides de IVA/IRPF/RE por par (cliente, empresa emisora). Si no hay row, se usan los defaults de tt_clients.';
COMMENT ON COLUMN tt_client_company_tax_config.subject_iva IS
  'Override: si esta empresa le aplica IVA a este cliente. Anula tt_clients.subject_iva.';
COMMENT ON COLUMN tt_client_company_tax_config.notes IS
  'Justificación opcional del override (ej: "Exportación CABA → USA, Art. 8 LIVA").';

-- Índices
CREATE INDEX IF NOT EXISTS idx_tt_cli_co_tax_company ON tt_client_company_tax_config(company_id);
CREATE INDEX IF NOT EXISTS idx_tt_cli_co_tax_client  ON tt_client_company_tax_config(client_id);

-- Trigger para updated_at — definimos la función defensivamente (CREATE OR REPLACE
-- es idempotente; si ya existe en otra migración, simplemente la reescribe igual).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tt_cli_co_tax_updated_at ON tt_client_company_tax_config;
CREATE TRIGGER trg_tt_cli_co_tax_updated_at
  BEFORE UPDATE ON tt_client_company_tax_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: misma política que tt_clients (todos los usuarios autenticados pueden leer/editar)
ALTER TABLE tt_client_company_tax_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tt_cli_co_tax_select ON tt_client_company_tax_config;
CREATE POLICY tt_cli_co_tax_select ON tt_client_company_tax_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tt_cli_co_tax_insert ON tt_client_company_tax_config;
CREATE POLICY tt_cli_co_tax_insert ON tt_client_company_tax_config
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS tt_cli_co_tax_update ON tt_client_company_tax_config;
CREATE POLICY tt_cli_co_tax_update ON tt_client_company_tax_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tt_cli_co_tax_delete ON tt_client_company_tax_config;
CREATE POLICY tt_cli_co_tax_delete ON tt_client_company_tax_config
  FOR DELETE TO authenticated USING (true);
