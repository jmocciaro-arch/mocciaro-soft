-- migration-v72-comex-fase-b.sql
-- Módulo Comex — Fase B: couriers, servicios, zonas y tarifas.
-- Decisión de negocio (Juan, 2026-06-11): tarifas POR EMPRESA → tt_carriers y
-- tt_carrier_rates llevan company_id NOT NULL; el aislamiento cross-company lo
-- dan los guards de los endpoints (patrón channels), no la RLS.

CREATE TABLE IF NOT EXISTS tt_carriers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  code                text NOT NULL,
  name                text NOT NULL,
  -- divisor volumétrico cm³/kg (estándar couriers ~5000); override por servicio
  volumetric_divisor  int NOT NULL DEFAULT 5000 CHECK (volumetric_divisor > 0),
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- Servicios por courier (Express/Economy). v1 no tiene UI propia: el esquema
-- queda listo y service_id es nullable en rates ("un solo servicio" default).
CREATE TABLE IF NOT EXISTS tt_carrier_services (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id          uuid NOT NULL REFERENCES tt_carriers(id) ON DELETE CASCADE,
  code                text NOT NULL,
  label               text NOT NULL,
  volumetric_divisor  int CHECK (volumetric_divisor IS NULL OR volumetric_divisor > 0),
  transit_days_min    int,
  transit_days_max    int,
  active              boolean NOT NULL DEFAULT true,
  UNIQUE (carrier_id, code)
);

CREATE TABLE IF NOT EXISTS tt_carrier_zones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id    uuid NOT NULL REFERENCES tt_carriers(id) ON DELETE CASCADE,
  code          text NOT NULL,
  label         text NOT NULL,
  -- ISO-2 de los países que caen en esta zona: resuelve destino → zona tarifaria
  country_codes text[] NOT NULL DEFAULT '{}',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (carrier_id, code)
);

-- El corazón del lookup: banda de peso facturable → precio, por carrier+zona.
CREATE TABLE IF NOT EXISTS tt_carrier_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  carrier_id      uuid NOT NULL REFERENCES tt_carriers(id) ON DELETE CASCADE,
  service_id      uuid REFERENCES tt_carrier_services(id) ON DELETE SET NULL,
  zone_id         uuid NOT NULL REFERENCES tt_carrier_zones(id) ON DELETE CASCADE,
  weight_from_kg  numeric NOT NULL CHECK (weight_from_kg >= 0),
  weight_to_kg    numeric NOT NULL,
  price           numeric NOT NULL CHECK (price >= 0),
  -- precio por kg que excede weight_to_kg (último tramo de la tabla del courier)
  per_kg_over     numeric CHECK (per_kg_over IS NULL OR per_kg_over >= 0),
  currency        text NOT NULL DEFAULT 'EUR',
  valid_from      date,
  valid_to        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (weight_to_kg > weight_from_kg)
);

CREATE INDEX IF NOT EXISTS idx_carrier_rates_lookup
  ON tt_carrier_rates (carrier_id, zone_id, weight_from_kg);

-- RLS patrón tt_*: acceso a logueados, aislamiento real en endpoints.
ALTER TABLE tt_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_carrier_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_carrier_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_carrier_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON tt_carriers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON tt_carrier_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON tt_carrier_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON tt_carrier_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ROLLBACK:
-- DROP TABLE IF EXISTS tt_carrier_rates;
-- DROP TABLE IF EXISTS tt_carrier_zones;
-- DROP TABLE IF EXISTS tt_carrier_services;
-- DROP TABLE IF EXISTS tt_carriers;
