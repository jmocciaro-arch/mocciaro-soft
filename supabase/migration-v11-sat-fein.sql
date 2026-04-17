-- =====================================================
-- Migration v11: SAT FEIN — tablas para replicar Buscatools
-- =====================================================
-- Agrega las tablas necesarias para replicar el sistema de
-- mantenimiento Buscatools FEIN AccuTec dentro del modulo SAT:
--   - tt_sat_assets             (equipos fisicos, 330 FEIN)
--   - tt_fein_models            (specs tecnicas de 9 modelos)
--   - tt_sat_spare_parts        (catalogo repuestos + accesorios)
--   - tt_sat_manuals            (manuales PDF por modelo)
--   - tt_sat_paused_workflows   (fichas pausadas con snapshot)
--   - tt_sat_bulk_quotes        (cotizaciones por lote multi-equipo)
--   - tt_sat_service_history    (historial permanente de servicios)
-- Todas con RLS filtrado por company_id.
-- =====================================================

-- Extension para gen_random_uuid() (suele estar activada)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------
-- 1) tt_sat_assets  — Equipos fisicos (330 FEIN)
-- ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_sat_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT UNIQUE NOT NULL,
  internal_id TEXT,
  serial_number TEXT,
  brand TEXT DEFAULT 'FEIN',
  model TEXT,
  model_normalized TEXT,
  client_id UUID REFERENCES tt_clients(id) ON DELETE SET NULL,
  client_name_raw TEXT,
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE NOT NULL,
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'AR',
  warranty_start DATE,
  warranty_end DATE,
  is_new BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sat_assets_company ON tt_sat_assets (company_id);
CREATE INDEX IF NOT EXISTS idx_sat_assets_client ON tt_sat_assets (client_id);
CREATE INDEX IF NOT EXISTS idx_sat_assets_model ON tt_sat_assets (model_normalized);
CREATE INDEX IF NOT EXISTS idx_sat_assets_ref ON tt_sat_assets (ref);

ALTER TABLE tt_sat_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_assets_tenant_select" ON tt_sat_assets FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid()
  ));

CREATE POLICY "sat_assets_tenant_insert" ON tt_sat_assets FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid()
  ));

CREATE POLICY "sat_assets_tenant_update" ON tt_sat_assets FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid()
  ));

CREATE POLICY "sat_assets_tenant_delete" ON tt_sat_assets FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid()
  ));

-- ------------------------------------------------------
-- 2) tt_fein_models  — Specs tecnicas de los 9 modelos FEIN
-- ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_fein_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_code TEXT UNIQUE NOT NULL,
  name TEXT,
  tipo TEXT,
  par_min NUMERIC,
  par_max NUMERIC,
  par_unit TEXT DEFAULT 'Nm',
  vel_min INT,
  vel_max INT,
  vel_fabrica INT,
  vel_unit TEXT DEFAULT 'rpm',
  peso NUMERIC,
  peso_unit TEXT DEFAULT 'kg',
  interfaz TEXT,
  precision TEXT,
  uso TEXT,
  nro_pedido TEXT,
  extra_specs JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fein_models_code ON tt_fein_models (model_code);

-- Catalogo global (sin RLS — visible a todos los usuarios autenticados)
ALTER TABLE tt_fein_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fein_models_select_authenticated" ON tt_fein_models FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "fein_models_admin_write" ON tt_fein_models FOR ALL
  USING (EXISTS (
    SELECT 1 FROM tt_users WHERE auth_id = auth.uid() AND role IN ('admin', 'superadmin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tt_users WHERE auth_id = auth.uid() AND role IN ('admin', 'superadmin')
  ));

-- ------------------------------------------------------
-- 3) tt_sat_spare_parts  — Catalogo repuestos + accesorios
-- ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_sat_spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  codigo TEXT,
  pos TEXT,
  descripcion TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('repuesto','accesorio','consumible','otro')) DEFAULT 'repuesto',
  modelos TEXT[] DEFAULT ARRAY[]::TEXT[],
  precio_eur NUMERIC DEFAULT 0,
  precio_venta NUMERIC DEFAULT 0,
  img_url TEXT,
  is_custom BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spare_parts_company ON tt_sat_spare_parts (company_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_modelos ON tt_sat_spare_parts USING GIN (modelos);
CREATE INDEX IF NOT EXISTS idx_spare_parts_active ON tt_sat_spare_parts (active);
CREATE INDEX IF NOT EXISTS idx_spare_parts_tipo ON tt_sat_spare_parts (tipo);

ALTER TABLE tt_sat_spare_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spare_parts_tenant_select" ON tt_sat_spare_parts FOR SELECT
  USING (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "spare_parts_tenant_write" ON tt_sat_spare_parts FOR ALL
  USING (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  )
  WITH CHECK (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------
-- 4) tt_sat_manuals  — Manuales PDF
-- ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_sat_manuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('manual','catalogo','instructivo','otro')) DEFAULT 'manual',
  modelos TEXT[] DEFAULT ARRAY[]::TEXT[],
  url TEXT NOT NULL,
  descripcion TEXT,
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manuals_company ON tt_sat_manuals (company_id);
CREATE INDEX IF NOT EXISTS idx_manuals_modelos ON tt_sat_manuals USING GIN (modelos);

ALTER TABLE tt_sat_manuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manuals_tenant_select" ON tt_sat_manuals FOR SELECT
  USING (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "manuals_tenant_write" ON tt_sat_manuals FOR ALL
  USING (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  )
  WITH CHECK (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------
-- 5) tt_sat_paused_workflows  — Fichas pausadas
-- ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_sat_paused_workflows (
  ticket_id UUID PRIMARY KEY REFERENCES tt_sat_tickets(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  detail TEXT,
  current_step INT DEFAULT 0,
  snapshot JSONB NOT NULL,
  paused_by UUID REFERENCES tt_users(id) ON DELETE SET NULL,
  paused_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paused_workflows_paused_by ON tt_sat_paused_workflows (paused_by);
CREATE INDEX IF NOT EXISTS idx_paused_workflows_reason ON tt_sat_paused_workflows (reason);

ALTER TABLE tt_sat_paused_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paused_workflows_tenant" ON tt_sat_paused_workflows FOR ALL
  USING (EXISTS (
    SELECT 1 FROM tt_sat_tickets t
    JOIN tt_user_companies m ON m.company_id = t.company_id
    WHERE t.id = tt_sat_paused_workflows.ticket_id AND m.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tt_sat_tickets t
    JOIN tt_user_companies m ON m.company_id = t.company_id
    WHERE t.id = tt_sat_paused_workflows.ticket_id AND m.user_id = auth.uid()
  ));

-- ------------------------------------------------------
-- 6) tt_sat_bulk_quotes  — Cotizaciones por lote
-- ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_sat_bulk_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES tt_clients(id) ON DELETE SET NULL,
  asset_ids UUID[] DEFAULT ARRAY[]::UUID[],
  items JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT CHECK (status IN ('pendiente','enviada','aprobada','rechazada')) DEFAULT 'pendiente',
  total_amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  ts_enviada TIMESTAMPTZ,
  ts_aprobada TIMESTAMPTZ,
  created_by UUID REFERENCES tt_users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_quotes_company ON tt_sat_bulk_quotes (company_id);
CREATE INDEX IF NOT EXISTS idx_bulk_quotes_client ON tt_sat_bulk_quotes (client_id);
CREATE INDEX IF NOT EXISTS idx_bulk_quotes_status ON tt_sat_bulk_quotes (status);

ALTER TABLE tt_sat_bulk_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulk_quotes_tenant" ON tt_sat_bulk_quotes FOR ALL
  USING (company_id IN (
    SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid()
  ));

-- ------------------------------------------------------
-- 7) tt_sat_service_history  — Historial permanente
-- ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_sat_service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES tt_sat_assets(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES tt_sat_tickets(id) ON DELETE SET NULL,
  service_number INT,
  fecha DATE,
  tecnico TEXT,
  tecnico_recepcion TEXT,
  tecnico_mant TEXT,
  tipo TEXT,
  partes JSONB DEFAULT '{}'::JSONB,
  torque_measurements JSONB DEFAULT '{}'::JSONB,
  cot_total NUMERIC,
  cot_estado TEXT,
  aprietes INT,
  tiempo_horas NUMERIC,
  estado_final TEXT,
  obs TEXT,
  ts_recepcion TIMESTAMPTZ,
  ts_inicio_mant TIMESTAMPTZ,
  ts_cot_enviada TIMESTAMPTZ,
  ts_cot_aprobada TIMESTAMPTZ,
  delta_espera_min INT,
  delta_apro_min INT,
  company_id UUID REFERENCES tt_companies(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_history_asset ON tt_sat_service_history (asset_id);
CREATE INDEX IF NOT EXISTS idx_service_history_ticket ON tt_sat_service_history (ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_history_company ON tt_sat_service_history (company_id);
CREATE INDEX IF NOT EXISTS idx_service_history_fecha ON tt_sat_service_history (fecha DESC);

ALTER TABLE tt_sat_service_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_history_tenant_select" ON tt_sat_service_history FOR SELECT
  USING (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "service_history_tenant_write" ON tt_sat_service_history FOR ALL
  USING (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  )
  WITH CHECK (
    company_id IS NULL OR
    company_id IN (SELECT company_id FROM tt_user_companies WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------
-- tt_clients: agregar columna 'source' para auditar seeds
-- ------------------------------------------------------
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS source TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_source ON tt_clients (source);

-- ------------------------------------------------------
-- Trigger de updated_at
-- ------------------------------------------------------
CREATE OR REPLACE FUNCTION _sat_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sat_assets_updated ON tt_sat_assets;
CREATE TRIGGER trg_sat_assets_updated BEFORE UPDATE ON tt_sat_assets
  FOR EACH ROW EXECUTE FUNCTION _sat_set_updated_at();

DROP TRIGGER IF EXISTS trg_sat_spare_parts_updated ON tt_sat_spare_parts;
CREATE TRIGGER trg_sat_spare_parts_updated BEFORE UPDATE ON tt_sat_spare_parts
  FOR EACH ROW EXECUTE FUNCTION _sat_set_updated_at();

DROP TRIGGER IF EXISTS trg_sat_bulk_quotes_updated ON tt_sat_bulk_quotes;
CREATE TRIGGER trg_sat_bulk_quotes_updated BEFORE UPDATE ON tt_sat_bulk_quotes
  FOR EACH ROW EXECUTE FUNCTION _sat_set_updated_at();

-- ------------------------------------------------------
-- Comentarios de tablas
-- ------------------------------------------------------
COMMENT ON TABLE tt_sat_assets IS 'Equipos fisicos FEIN (330 activos iniciales), identificados por ref/internal_id/serial_number';
COMMENT ON TABLE tt_fein_models IS 'Catalogo de modelos FEIN AccuTec con especificaciones tecnicas';
COMMENT ON TABLE tt_sat_spare_parts IS 'Catalogo de repuestos y accesorios FEIN con precios EUR/USD';
COMMENT ON TABLE tt_sat_manuals IS 'Manuales PDF, catalogos e instructivos';
COMMENT ON TABLE tt_sat_paused_workflows IS 'Fichas de servicio pausadas con snapshot del formulario';
COMMENT ON TABLE tt_sat_bulk_quotes IS 'Cotizaciones por lote multi-equipo';
COMMENT ON TABLE tt_sat_service_history IS 'Historial permanente de servicios realizados (write-once al cerrar ficha)';
