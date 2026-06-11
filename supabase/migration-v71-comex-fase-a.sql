-- migration-v71-comex-fase-a.sql
-- Módulo Comex y Logística — Fase A: datos físicos del producto + catálogo de packing.
-- Aditivo: no toca tt_products ni el cotizador.

-- ── Catálogo de tipos de packing (pallets, cajas) — global, editable ──
CREATE TABLE IF NOT EXISTS tt_packing_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('pallet','caja','sobre','otro')),
  code            text NOT NULL UNIQUE,
  label           text NOT NULL,
  length_cm       numeric NOT NULL,
  width_cm        numeric NOT NULL,
  height_cm       numeric,
  max_height_cm   numeric,          -- altura máx apilable (pallets)
  tare_weight_kg  numeric NOT NULL DEFAULT 0,
  max_payload_kg  numeric,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Datos físicos por producto — tabla SATÉLITE 1:1 (el sync StelOrder no la toca) ──
CREATE TABLE IF NOT EXISTS tt_product_logistics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL UNIQUE REFERENCES tt_products(id) ON DELETE CASCADE,
  net_weight_kg     numeric,
  gross_weight_kg   numeric,
  length_cm         numeric,
  width_cm          numeric,
  height_cm         numeric,
  -- m³ derivado de las dimensiones (null si faltan); el motor usa esto o las dims sueltas
  volume_m3         numeric GENERATED ALWAYS AS (length_cm * width_cm * height_cm / 1000000) STORED,
  default_packing_id uuid REFERENCES tt_packing_types(id) ON DELETE SET NULL,
  units_per_packing int,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS: mismo patrón que el resto de tt_* (acceso a logueados; el aislamiento real
-- lo dan los endpoints con admin client + guards). anon bloqueado por defecto.
ALTER TABLE tt_packing_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_product_logistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON tt_packing_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON tt_product_logistics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Permisos RBAC del módulo ──
INSERT INTO tt_permissions (name, label, module, description) VALUES
  ('view_comex',   'Ver Comex y Logística',       'comex', 'Acceso de lectura al módulo Comex'),
  ('manage_comex', 'Gestionar Comex y Logística', 'comex', 'Cargar datos físicos, packing, couriers y tarifas')
ON CONFLICT (name) DO NOTHING;

-- Asignar ambos permisos a los mismos roles que ya tienen manage_channels.
INSERT INTO tt_role_permissions (role_id, permission_id)
SELECT r.role_id, p.id
FROM (VALUES
  ('11db0a6e-477c-4d9d-b6b2-d8fc954fea97'::uuid),
  ('ca40cf24-6f45-49ee-a1c5-9b32f138228c'::uuid)
) AS r(role_id)
CROSS JOIN tt_permissions p
WHERE p.name IN ('view_comex','manage_comex')
ON CONFLICT DO NOTHING;

-- ROLLBACK:
-- DELETE FROM tt_role_permissions WHERE permission_id IN (SELECT id FROM tt_permissions WHERE name IN ('view_comex','manage_comex'));
-- DELETE FROM tt_permissions WHERE name IN ('view_comex','manage_comex');
-- DROP TABLE IF EXISTS tt_product_logistics;
-- DROP TABLE IF EXISTS tt_packing_types;
