-- ================================================================
-- MIGRATION V41 — CATALOG PRESETS
-- Pre-carga categorías estándar, marcas, atributos y valores
-- para la industria de herramientas de torque.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) CATEGORIAS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_catalog_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  emoji       text,
  parent_id   uuid REFERENCES tt_catalog_categories(id) ON DELETE SET NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  description text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_categories_parent ON tt_catalog_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_active ON tt_catalog_categories(active);

-- ----------------------------------------------------------------
-- 2) ATRIBUTOS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_catalog_attributes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,   -- 'torque_min', 'encastre', 'drive_type'
  name        text NOT NULL,
  unit        text,                   -- 'Nm', 'kg', 'mm', etc
  type        text NOT NULL,          -- 'select' | 'text' | 'number' | 'range' | 'boolean'
  sort_order  int  NOT NULL DEFAULT 0,
  admin_only  boolean NOT NULL DEFAULT false,  -- solo admin puede agregar valores nuevos
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 3) VALORES DE ATRIBUTOS (diccionarios)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_catalog_attribute_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id  uuid NOT NULL REFERENCES tt_catalog_attributes(id) ON DELETE CASCADE,
  value         text NOT NULL,
  label         text,                  -- opcional, si difiere del value
  sort_order    int  NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  UNIQUE(attribute_id, value)
);

CREATE INDEX IF NOT EXISTS idx_cat_attr_values_attr ON tt_catalog_attribute_values(attribute_id);

-- ----------------------------------------------------------------
-- 4) RELACION CATEGORIA ↔ ATRIBUTOS DESTACADOS
-- Qué atributos son "importantes" para cada categoría
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_catalog_category_attributes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid NOT NULL REFERENCES tt_catalog_categories(id) ON DELETE CASCADE,
  attribute_id  uuid NOT NULL REFERENCES tt_catalog_attributes(id) ON DELETE CASCADE,
  is_required   boolean NOT NULL DEFAULT false,
  is_featured   boolean NOT NULL DEFAULT true,  -- mostrar en card/modal
  is_filter     boolean NOT NULL DEFAULT true,  -- usar como filtro facetado
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE(category_id, attribute_id)
);

-- ----------------------------------------------------------------
-- 5) MARCAS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_catalog_brands (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text UNIQUE NOT NULL,
  name           text NOT NULL,
  logo_url       text,
  country_origin text,
  website        text,
  description    text,
  sort_order     int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- RLS
-- ================================================================
ALTER TABLE tt_catalog_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_catalog_attributes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_catalog_attribute_values    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_catalog_category_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_catalog_brands              ENABLE ROW LEVEL SECURITY;

-- Read: cualquier autenticado
DO $$ BEGIN
  CREATE POLICY "cat_categories_read"  ON tt_catalog_categories          FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_attributes_read"  ON tt_catalog_attributes          FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_attr_values_read" ON tt_catalog_attribute_values    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_cat_attrs_read"   ON tt_catalog_category_attributes FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_brands_read"      ON tt_catalog_brands              FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Write: service role (las API routes usan service role para chequear admin)
DO $$ BEGIN
  CREATE POLICY "cat_categories_all"  ON tt_catalog_categories          FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_attributes_all"  ON tt_catalog_attributes          FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_attr_values_all" ON tt_catalog_attribute_values    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_cat_attrs_all"   ON tt_catalog_category_attributes FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_brands_all"      ON tt_catalog_brands              FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow authenticated to insert (se valida el rol en la API route)
DO $$ BEGIN
  CREATE POLICY "cat_categories_ins_auth"  ON tt_catalog_categories          FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_attr_values_ins_auth" ON tt_catalog_attribute_values    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "cat_brands_ins_auth"      ON tt_catalog_brands              FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================================================================
-- DATA: CATEGORIAS
-- ================================================================
INSERT INTO tt_catalog_categories (slug, name, emoji, sort_order, description) VALUES
  ('atornilladores', 'Atornilladores',  '🔧', 10, 'Herramientas de atornillado neumáticas, eléctricas e hidráulicas'),
  ('torquimetros',   'Torquímetros',    '🔩', 20, 'Llaves y herramientas para medir y controlar torque'),
  ('puntas',         'Puntas',          '🔸', 30, 'Puntas y bits para atornilladores (Phillips, Torx, Allen, etc)'),
  ('tubos',          'Tubos',           '🔵', 40, 'Tubos de impacto y corriente con distintos encastres'),
  ('balanceadores',  'Balanceadores',   '⚖️', 50, 'Balanceadores y equilibradores de herramientas'),
  ('accesorios',     'Accesorios',      '🔗', 90, 'Extensiones, adaptadores, mangos, repuestos varios')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  updated_at = now();

-- ================================================================
-- DATA: MARCAS (industria torque)
-- ================================================================
INSERT INTO tt_catalog_brands (slug, name, country_origin, sort_order) VALUES
  ('fein',              'FEIN',              'DE', 10),
  ('ingersoll-rand',    'INGERSOLL RAND',    'US', 20),
  ('chicago-pneumatic', 'CHICAGO PNEUMATIC', 'US', 30),
  ('speedrill',         'SPEEDRILL',         'AR', 40),
  ('tohnichi',          'TOHNICHI',          'JP', 50),
  ('stahlwille',        'STAHLWILLE',        'DE', 60),
  ('norbar',            'NORBAR',            'GB', 70),
  ('facom',             'FACOM',             'FR', 80),
  ('beta',              'BETA',              'IT', 90),
  ('king-tony',         'KING TONY',         'TW', 100),
  ('vessel',            'VESSEL',            'JP', 110),
  ('apex',              'APEX',              'US', 120),
  ('hios',              'HIOS',              'JP', 130),
  ('kolver',            'KOLVER',            'IT', 140),
  ('mountz',            'MOUNTZ',            'US', 150),
  ('atlas-copco',       'ATLAS COPCO',       'SE', 160),
  ('desoutter',         'DESOUTTER',         'FR', 170),
  ('fiam',              'FIAM',              'IT', 180),
  ('kromer',            'KROMER',            'DE', 190),
  ('tone',              'TONE',              'JP', 200)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  country_origin = EXCLUDED.country_origin,
  sort_order = EXCLUDED.sort_order;

-- ================================================================
-- DATA: ATRIBUTOS GLOBALES
-- ================================================================
INSERT INTO tt_catalog_attributes (code, name, unit, type, sort_order) VALUES
  ('torque_min',       'Torque mínimo',      'Nm',  'number',  10),
  ('torque_max',       'Torque máximo',      'Nm',  'number',  11),
  ('rpm',              'Velocidad',          'RPM', 'number',  20),
  ('encastre',         'Encastre',           NULL,  'select',  30),
  ('drive_type',       'Tipo de accionamiento', NULL, 'select', 40),
  ('voltaje',          'Voltaje',            'V',   'select',  50),
  ('peso',             'Peso',               'kg',  'number',  60),
  ('longitud',         'Longitud',           'mm',  'number',  70),
  ('tipo_punta',       'Tipo de punta',      NULL,  'select',  80),
  ('medida_punta',     'Medida',             NULL,  'select',  81),
  ('tipo_tubo',        'Tipo de tubo',       NULL,  'select',  85),
  ('tipo_torquimetro', 'Tipo de torquímetro', NULL, 'select',  90),
  ('precision',        'Precisión',          '%',   'number',  95),
  ('capacidad_kg',     'Capacidad',          'kg',  'number', 100),
  ('recorrido_m',      'Recorrido',          'm',   'number', 110),
  ('ruido_db',         'Ruido',              'dB',  'number', 120),
  ('consumo_aire',     'Consumo de aire',    'cfm', 'number', 130),
  ('presion_bar',      'Presión de aire',    'bar', 'number', 140)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  type = EXCLUDED.type,
  sort_order = EXCLUDED.sort_order;

-- ================================================================
-- DATA: VALORES PREDEFINIDOS POR ATRIBUTO
-- ================================================================

-- Encastres estándar
WITH attr AS (SELECT id FROM tt_catalog_attributes WHERE code='encastre')
INSERT INTO tt_catalog_attribute_values (attribute_id, value, sort_order)
SELECT attr.id, v, i FROM attr, (VALUES
  ('1/4"',     10),
  ('5/16"',    15),
  ('3/8"',     20),
  ('1/2"',     30),
  ('5/8"',     35),
  ('3/4"',     40),
  ('1"',       50),
  ('1.1/2"',   60),
  ('2.1/2"',   70),
  ('HEX 1/4"', 80),
  ('HEX 5/16"',85),
  ('HEX 3/8"', 90)
) AS t(v, i)
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Tipos de accionamiento (drive_type)
WITH attr AS (SELECT id FROM tt_catalog_attributes WHERE code='drive_type')
INSERT INTO tt_catalog_attribute_values (attribute_id, value, sort_order)
SELECT attr.id, v, i FROM attr, (VALUES
  ('Neumático',             10),
  ('Eléctrico con cable',   20),
  ('Eléctrico inalámbrico', 30),
  ('Hidráulico',            40),
  ('Manual',                50),
  ('Transductor',           60)
) AS t(v, i)
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Voltajes
WITH attr AS (SELECT id FROM tt_catalog_attributes WHERE code='voltaje')
INSERT INTO tt_catalog_attribute_values (attribute_id, value, sort_order)
SELECT attr.id, v, i FROM attr, (VALUES
  ('12V',   10),
  ('18V',   20),
  ('20V',   30),
  ('24V',   40),
  ('36V',   50),
  ('110V',  60),
  ('220V',  70),
  ('380V',  80)
) AS t(v, i)
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Tipos de punta
WITH attr AS (SELECT id FROM tt_catalog_attributes WHERE code='tipo_punta')
INSERT INTO tt_catalog_attribute_values (attribute_id, value, sort_order)
SELECT attr.id, v, i FROM attr, (VALUES
  ('Phillips',  10),
  ('Pozidriv',  20),
  ('Torx',      30),
  ('Hex/Allen', 40),
  ('Ranura',    50),
  ('Robertson', 60),
  ('Tri-Wing',  70),
  ('Torq-Set',  80),
  ('Spanner',   90),
  ('Combo',    100)
) AS t(v, i)
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Medidas de punta (mm)
WITH attr AS (SELECT id FROM tt_catalog_attributes WHERE code='medida_punta')
INSERT INTO tt_catalog_attribute_values (attribute_id, value, sort_order)
SELECT attr.id, v, i FROM attr, (VALUES
  ('PH0',   10),('PH1',  11),('PH2',  12),('PH3',  13),('PH4', 14),
  ('PZ0',   20),('PZ1',  21),('PZ2',  22),('PZ3',  23),
  ('T6',    30),('T8',   31),('T10',  32),('T15',  33),('T20', 34),
  ('T25',   35),('T27',  36),('T30',  37),('T40',  38),('T45', 39),('T50', 40),('T55', 41),
  ('H1',    50),('H1.5', 51),('H2',   52),('H2.5', 53),('H3',  54),('H4',  55),
  ('H5',    56),('H6',   57),('H8',   58),('H10',  59),
  ('1.2mm', 70),('1.5mm',71),('2mm',  72),('3mm',  73),('4mm', 74),('5mm', 75),('6mm', 76)
) AS t(v, i)
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Tipos de tubo
WITH attr AS (SELECT id FROM tt_catalog_attributes WHERE code='tipo_tubo')
INSERT INTO tt_catalog_attribute_values (attribute_id, value, sort_order)
SELECT attr.id, v, i FROM attr, (VALUES
  ('Impacto',     10),
  ('Corriente',   20),
  ('Bihexagonal', 30),
  ('Hexagonal',   40),
  ('Vaso largo',  50),
  ('Vaso profundo',60),
  ('Torx',        70),
  ('Bocallave',   80)
) AS t(v, i)
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Tipos de torquímetro
WITH attr AS (SELECT id FROM tt_catalog_attributes WHERE code='tipo_torquimetro')
INSERT INTO tt_catalog_attribute_values (attribute_id, value, sort_order)
SELECT attr.id, v, i FROM attr, (VALUES
  ('Click',      10),
  ('Digital',    20),
  ('Dial / Aguja', 30),
  ('Electrónico', 40),
  ('Hidráulico', 50),
  ('Neumático',  60),
  ('Multiplicador', 70),
  ('De banco',   80)
) AS t(v, i)
ON CONFLICT (attribute_id, value) DO NOTHING;

-- ================================================================
-- DATA: RELACION CATEGORIA ↔ ATRIBUTOS DESTACADOS
-- ================================================================

-- Usamos CTEs para resolver categoría y atributo por slug/code
-- (mucho más limpio que un bloque DO $$ con variables)
INSERT INTO tt_catalog_category_attributes
  (category_id, attribute_id, is_featured, is_filter, is_required, sort_order)
SELECT c.id, a.id, t.is_featured, t.is_filter, t.is_required, t.sort_order
FROM (VALUES
  -- ATORNILLADORES
  ('atornilladores', 'torque_min',       true,  true,  false, 10),
  ('atornilladores', 'torque_max',       true,  true,  true,  11),
  ('atornilladores', 'rpm',              true,  true,  false, 20),
  ('atornilladores', 'encastre',         true,  true,  true,  30),
  ('atornilladores', 'drive_type',       true,  true,  true,  40),
  ('atornilladores', 'voltaje',          true,  true,  false, 50),
  ('atornilladores', 'peso',             true,  false, false, 60),
  -- TORQUIMETROS
  ('torquimetros',   'torque_min',       true,  true,  true,  10),
  ('torquimetros',   'torque_max',       true,  true,  true,  11),
  ('torquimetros',   'encastre',         true,  true,  true,  20),
  ('torquimetros',   'tipo_torquimetro', true,  true,  true,  30),
  ('torquimetros',   'precision',        true,  false, false, 40),
  ('torquimetros',   'peso',             true,  false, false, 50),
  -- PUNTAS
  ('puntas',         'tipo_punta',       true,  true,  true,  10),
  ('puntas',         'medida_punta',     true,  true,  true,  20),
  ('puntas',         'encastre',         true,  true,  true,  30),
  ('puntas',         'longitud',         true,  true,  false, 40),
  -- TUBOS (reuso medida_punta para la medida del tubo)
  ('tubos',          'tipo_tubo',        true,  true,  true,  10),
  ('tubos',          'encastre',         true,  true,  true,  20),
  ('tubos',          'medida_punta',     true,  true,  true,  30),
  ('tubos',          'longitud',         true,  false, false, 40),
  -- BALANCEADORES
  ('balanceadores',  'capacidad_kg',     true,  true,  true,  10),
  ('balanceadores',  'recorrido_m',      true,  true,  true,  20),
  ('balanceadores',  'peso',             true,  false, false, 30),
  -- ACCESORIOS
  ('accesorios',     'encastre',         true,  true,  false, 10)
) AS t(cat_slug, attr_code, is_featured, is_filter, is_required, sort_order)
JOIN tt_catalog_categories c ON c.slug = t.cat_slug
JOIN tt_catalog_attributes  a ON a.code = t.attr_code
ON CONFLICT (category_id, attribute_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ================================================================
-- RESUMEN
-- ================================================================
-- Categorías:     6 (5 principales + accesorios)
-- Marcas:        20
-- Atributos:     18 (torque, rpm, encastre, drive, voltaje, peso, ...)
-- Valores:      ~80 (encastres, voltajes, tipos de puntas/tubos/torquímetros)
-- Relaciones:   Atornilladores(7), Torquímetros(6), Puntas(4), Tubos(4), Balanceadores(3), Accesorios(1)
