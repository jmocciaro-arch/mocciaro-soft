-- =====================================================================
-- MOCCIARO SOFT — Migración v34
-- Catálogo Woo-compatible (products, variants, attributes, categorías N:N,
-- imágenes, price_lists, stock_levels, integration_mappings)
--
-- Convenciones:
--   * Tablas nuevas SIN prefijo (products, product_variants, ...) alineadas
--     al handoff y al BLUEPRINT. Las tablas legacy tt_* quedan intactas.
--   * Idempotente: reejecutable sin errores (IF NOT EXISTS / ON CONFLICT /
--     DROP POLICY IF EXISTS / DO block con pg_constraint check).
--   * Preserva IDs de tt_products y tt_product_categories para no romper
--     FKs existentes del sistema legacy.
--
-- Orden de ejecución:
--   1. extensions
--   2. brands, product_series
--   3. product_categories (auto-FK), product_tags
--   4. product_attributes, product_attribute_terms
--   5. products
--   6. product_category_map, product_tag_map, product_attribute_assignments
--   7. product_variants, product_variant_attribute_values
--   8. product_images (+ FKs diferidas a products y product_variants)
--   9. price_lists, price_list_items
--  10. warehouses, stock_levels
--  11. integration_mappings
--  12. product_relations
--  13. triggers (updated_at, combination_hash)
--  14. RLS
--  15. Data migration desde tt_*
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. Extensiones
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================================
-- 2. Marcas y series
-- =====================================================================
CREATE TABLE IF NOT EXISTS brands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  logo_url     text,
  website      text,
  description  text,
  is_protected boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands(slug);
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(active);

CREATE TABLE IF NOT EXISTS product_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid REFERENCES brands(id) ON DELETE SET NULL,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  sort_order  int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_product_series_brand ON product_series(brand_id);

-- =====================================================================
-- 3. Categorías jerárquicas + tags
-- =====================================================================
CREATE TABLE IF NOT EXISTS product_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  image_url   text,
  sort_order  int NOT NULL DEFAULT 0,
  seo         jsonb NOT NULL DEFAULT '{}'::jsonb,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_slug ON product_categories(slug);

CREATE TABLE IF NOT EXISTS product_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 4. Atributos globales (equivalentes a Woo pa_*)
-- =====================================================================
CREATE TABLE IF NOT EXISTS product_attributes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  type       text NOT NULL DEFAULT 'select'
             CHECK (type IN ('select','text','number','boolean')),
  is_global  boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_attribute_terms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  slug         text NOT NULL,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attribute_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_attr_terms_attr ON product_attribute_terms(attribute_id);

-- =====================================================================
-- 5. Productos
-- =====================================================================
CREATE TABLE IF NOT EXISTS products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid REFERENCES tt_companies(id) ON DELETE SET NULL,

  sku                 text,
  name                text NOT NULL,
  slug                text NOT NULL,
  product_type        text NOT NULL DEFAULT 'simple'
                      CHECK (product_type IN ('simple','variable','service','spare_part','bundle','external')),
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','private','archived')),
  visibility          text NOT NULL DEFAULT 'visible'
                      CHECK (visibility IN ('visible','catalog','search','hidden')),

  short_description   text,
  description         text,

  brand_id            uuid REFERENCES brands(id) ON DELETE SET NULL,
  series_id           uuid REFERENCES product_series(id) ON DELETE SET NULL,
  primary_category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,

  regular_price       numeric(14,4),
  sale_price          numeric(14,4),
  cost_price          numeric(14,4),
  min_price           numeric(14,4),
  vat_rate            numeric(5,2) DEFAULT 21,
  currency            text NOT NULL DEFAULT 'EUR',

  manage_stock        boolean NOT NULL DEFAULT true,
  stock_status        text NOT NULL DEFAULT 'instock'
                      CHECK (stock_status IN ('instock','outofstock','onbackorder')),
  backorders_policy   text NOT NULL DEFAULT 'no'
                      CHECK (backorders_policy IN ('no','notify','yes')),
  stock_min           int DEFAULT 0,
  stock_max           int,

  weight_kg           numeric(10,4),
  length_cm           numeric(10,2),
  width_cm            numeric(10,2),
  height_cm           numeric(10,2),

  seo_title           text,
  seo_description     text,
  canonical_url       text,
  seo_keywords        text[],

  thumbnail_media_id  uuid,   -- FK diferida → product_images

  specs               jsonb NOT NULL DEFAULT '{}'::jsonb,

  featured            boolean NOT NULL DEFAULT false,
  published_at        timestamptz,

  created_by          uuid REFERENCES tt_users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- SKU único sólo cuando no es NULL (no todos los productos tienen SKU)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_primary_category ON products(primary_category_id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_specs_gin ON products USING gin (specs);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING gin (sku gin_trgm_ops)
  WHERE sku IS NOT NULL;

-- =====================================================================
-- 6. Relaciones producto ↔ (categoría, tag, atributo)
-- =====================================================================
CREATE TABLE IF NOT EXISTS product_category_map (
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_pcm_category ON product_category_map(category_id);

CREATE TABLE IF NOT EXISTS product_tag_map (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_ptm_tag ON product_tag_map(tag_id);

CREATE TABLE IF NOT EXISTS product_attribute_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_id        uuid NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  visible             boolean NOT NULL DEFAULT true,
  used_for_variations boolean NOT NULL DEFAULT false,
  sort_order          int NOT NULL DEFAULT 0,
  term_ids            uuid[] NOT NULL DEFAULT '{}',
  custom_values       text[] NOT NULL DEFAULT '{}',
  UNIQUE (product_id, attribute_id)
);
CREATE INDEX IF NOT EXISTS idx_paa_product ON product_attribute_assignments(product_id);
CREATE INDEX IF NOT EXISTS idx_paa_variations ON product_attribute_assignments(product_id)
  WHERE used_for_variations;

-- =====================================================================
-- 7. Variantes
-- =====================================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku              text,
  barcode          text,
  regular_price    numeric(14,4),
  sale_price       numeric(14,4),
  cost_price       numeric(14,4),
  weight_kg        numeric(10,4),
  length_cm        numeric(10,2),
  width_cm         numeric(10,2),
  height_cm        numeric(10,2),
  image_id         uuid,    -- FK diferida → product_images
  sort_order       int NOT NULL DEFAULT 0,
  active           boolean NOT NULL DEFAULT true,
  stock_status     text NOT NULL DEFAULT 'instock'
                   CHECK (stock_status IN ('instock','outofstock','onbackorder')),
  combination_hash text,    -- SHA256 de la combinación (seteado por trigger)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
-- Evita dos variantes idénticas (misma combinación de atributos) para el mismo producto
CREATE UNIQUE INDEX IF NOT EXISTS uq_variants_combination
  ON product_variants(product_id, combination_hash) WHERE combination_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS product_variant_attribute_values (
  variant_id   uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  term_id      uuid REFERENCES product_attribute_terms(id) ON DELETE SET NULL,
  custom_value text,
  PRIMARY KEY (variant_id, attribute_id),
  CHECK (term_id IS NOT NULL OR custom_value IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pvav_attribute ON product_variant_attribute_values(attribute_id);
CREATE INDEX IF NOT EXISTS idx_pvav_term ON product_variant_attribute_values(term_id);

-- =====================================================================
-- 8. Imágenes / media (galería ordenada + destacada + por variante)
-- =====================================================================
CREATE TABLE IF NOT EXISTS product_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id   uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  url          text NOT NULL,
  storage_path text,
  alt          text,
  title        text,
  sort_order   int NOT NULL DEFAULT 0,
  is_featured  boolean NOT NULL DEFAULT false,
  mime_type    text,
  width        int,
  height       int,
  size_bytes   int,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_images_product  ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_variant  ON product_images(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_images_featured ON product_images(product_id) WHERE is_featured;

-- FKs diferidas ahora que existe product_images
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_thumbnail') THEN
    ALTER TABLE products
      ADD CONSTRAINT fk_products_thumbnail
      FOREIGN KEY (thumbnail_media_id) REFERENCES product_images(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_variants_image') THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT fk_variants_image
      FOREIGN KEY (image_id) REFERENCES product_images(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================================
-- 9. Listas de precios
-- =====================================================================
CREATE TABLE IF NOT EXISTS price_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES tt_companies(id) ON DELETE SET NULL,
  name       text NOT NULL,
  code       text NOT NULL,
  type       text NOT NULL DEFAULT 'sale'
             CHECK (type IN ('sale','purchase','distributor','b2b','promo')),
  currency   text NOT NULL DEFAULT 'EUR',
  valid_from date,
  valid_to   date,
  priority   int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id) ON DELETE CASCADE,
  variant_id    uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  price         numeric(14,4) NOT NULL,
  min_qty       int NOT NULL DEFAULT 1,
  discount_pct  numeric(5,2) DEFAULT 0,
  valid_from    date,
  valid_to      date,
  CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pli_list    ON price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_pli_product ON price_list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pli_variant ON price_list_items(variant_id);

-- =====================================================================
-- 10. Warehouses y stock por almacén/variante
-- =====================================================================
CREATE TABLE IF NOT EXISTS warehouses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES tt_companies(id) ON DELETE SET NULL,
  code       text NOT NULL,
  name       text NOT NULL,
  address    text,
  city       text,
  country    text DEFAULT 'ES',
  is_default boolean NOT NULL DEFAULT false,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS stock_levels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity        numeric(14,3) NOT NULL DEFAULT 0,
  reserved        numeric(14,3) NOT NULL DEFAULT 0,
  available       numeric(14,3) GENERATED ALWAYS AS (quantity - reserved) STORED,
  min_qty         numeric(14,3) DEFAULT 0,
  max_qty         numeric(14,3),
  last_counted_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Unicidad parcial: con variante ↔ sin variante (una fila por cada caso)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_wh_prod_var
  ON stock_levels(warehouse_id, product_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_wh_prod_no_var
  ON stock_levels(warehouse_id, product_id) WHERE variant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_variant ON stock_levels(variant_id);

-- =====================================================================
-- 11. Integration mappings (sync bidireccional WooCommerce/ML/etc)
-- =====================================================================
CREATE TABLE IF NOT EXISTS integration_mappings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_system      text NOT NULL,           -- 'woocommerce','mercadolibre','amazon',...
  external_entity_type text NOT NULL,           -- 'product','variation','category','attribute','term','image'
  external_id          text NOT NULL,
  local_entity_type    text NOT NULL,
  local_entity_id      uuid NOT NULL,
  sync_direction       text NOT NULL DEFAULT 'bidirectional'
                       CHECK (sync_direction IN ('push','pull','bidirectional')),
  last_sync_at         timestamptz,
  last_sync_hash       text,                    -- SHA256 del payload canónico
  last_error           text,
  is_stale             boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_system, external_entity_type, external_id),
  UNIQUE (external_system, local_entity_type, local_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_integ_local ON integration_mappings(local_entity_type, local_entity_id);
CREATE INDEX IF NOT EXISTS idx_integ_stale ON integration_mappings(is_stale) WHERE is_stale;

-- =====================================================================
-- 12. Relaciones producto ↔ producto (accesorios, repuestos, cross-sell)
-- =====================================================================
CREATE TABLE IF NOT EXISTS product_relations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  related_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation_type      text NOT NULL
                     CHECK (relation_type IN ('accessory','spare_part','cross_sell','up_sell','grouped','replacement')),
  sort_order         int NOT NULL DEFAULT 0,
  UNIQUE (product_id, related_product_id, relation_type),
  CHECK (product_id <> related_product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_relations_related ON product_relations(related_product_id);

-- =====================================================================
-- 13. Triggers utilitarios
-- =====================================================================

-- 13.1 updated_at genérico
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'brands','product_categories','products','product_variants','stock_levels'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated
                    BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- 13.2 combination_hash de variantes
CREATE OR REPLACE FUNCTION fn_variant_combination_hash(p_variant uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(
    digest(
      string_agg(
        attribute_id::text || '=' || coalesce(term_id::text, custom_value, ''),
        '|' ORDER BY attribute_id
      ),
      'sha256'
    ),
    'hex'
  )
  FROM product_variant_attribute_values WHERE variant_id = p_variant;
$$;

CREATE OR REPLACE FUNCTION trg_variant_hash() RETURNS trigger AS $$
DECLARE v uuid;
BEGIN
  v := COALESCE(NEW.variant_id, OLD.variant_id);
  UPDATE product_variants
     SET combination_hash = fn_variant_combination_hash(v)
   WHERE id = v;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pvav_hash ON product_variant_attribute_values;
CREATE TRIGGER trg_pvav_hash
  AFTER INSERT OR UPDATE OR DELETE ON product_variant_attribute_values
  FOR EACH ROW EXECUTE FUNCTION trg_variant_hash();

-- =====================================================================
-- 14. RLS (mínimo viable: lectura autenticados, escritura autenticados)
--     El filtro fino por rol/empresa se endurece en migración posterior,
--     mientras tanto se aplica en la API.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'products','product_variants','product_images','product_categories',
    'brands','product_attributes','product_attribute_terms',
    'product_attribute_assignments','product_variant_attribute_values',
    'product_category_map','product_tag_map','product_tags','product_series',
    'stock_levels','warehouses','price_lists','price_list_items',
    'integration_mappings','product_relations'
  ]) LOOP
    EXECUTE format('ALTER TABLE %1$s ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON %1$s
                    FOR SELECT
                    USING (auth.role() = ''authenticated'')', t);

    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_write ON %1$s
                    FOR ALL
                    USING (auth.role() = ''authenticated'')
                    WITH CHECK (auth.role() = ''authenticated'')', t);
  END LOOP;
END $$;

-- =====================================================================
-- 15. DATA MIGRATION desde tt_*
--     Preserva IDs para no romper FKs del sistema legacy.
-- =====================================================================

-- 15.1 Marcas — extraídas desde tt_products.brand (texto libre)
INSERT INTO brands (name, slug, active)
SELECT DISTINCT
  btrim(p.brand),
  lower(regexp_replace(btrim(p.brand), '[^a-zA-Z0-9]+', '-', 'g')),
  true
FROM tt_products p
WHERE p.brand IS NOT NULL
  AND btrim(p.brand) <> ''
  AND lower(regexp_replace(btrim(p.brand), '[^a-zA-Z0-9]+', '-', 'g')) <> ''
ON CONFLICT (slug) DO NOTHING;

-- 15.2 Categorías — preserva id y parent_id
INSERT INTO product_categories (id, parent_id, name, slug, description, sort_order)
SELECT c.id, c.parent_id, c.name, c.slug, c.description, COALESCE(c.sort_order, 0)
FROM tt_product_categories c
ON CONFLICT (id) DO NOTHING;

-- 15.3 Productos — preserva id; dedupliza slug y sku si hay colisiones en tt_products
WITH prepared AS (
  SELECT
    p.id,
    NULLIF(btrim(p.sku), '') AS sku_raw,
    p.name,
    p.description,
    lower(regexp_replace(btrim(p.name), '[^a-zA-Z0-9]+', '-', 'g')) AS base_slug,
    CASE WHEN COALESCE(p.is_active, true) THEN 'published' ELSE 'archived' END AS status,
    p.price_list  AS regular_price,
    p.price_cost  AS cost_price,
    COALESCE(p.price_currency, 'EUR') AS currency,
    COALESCE(p.specs, '{}'::jsonb) AS specs,
    COALESCE(p.is_featured, false) AS featured,
    p.created_at,
    p.category_id,
    lower(regexp_replace(btrim(p.brand), '[^a-zA-Z0-9]+', '-', 'g')) AS brand_slug,
    p.weight_kg,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(btrim(p.name), '[^a-zA-Z0-9]+', '-', 'g'))
      ORDER BY p.created_at NULLS LAST, p.id
    ) AS slug_rank,
    row_number() OVER (
      PARTITION BY NULLIF(btrim(p.sku), '')
      ORDER BY p.created_at NULLS LAST, p.id
    ) AS sku_rank
  FROM tt_products p
  WHERE p.name IS NOT NULL AND btrim(p.name) <> ''
)
INSERT INTO products (
  id, sku, name, slug, product_type, status,
  regular_price, cost_price, vat_rate, currency,
  description, specs, brand_id, primary_category_id,
  weight_kg, featured, manage_stock, stock_status, created_at
)
SELECT
  x.id,
  CASE
    WHEN x.sku_raw IS NULL THEN NULL
    WHEN x.sku_rank = 1     THEN x.sku_raw  -- primer uso: conserva SKU
    ELSE NULL                               -- duplicados quedan sin SKU para no chocar
  END,
  x.name,
  CASE
    WHEN x.base_slug = ''    THEN 'product-' || x.id::text
    WHEN x.slug_rank = 1     THEN x.base_slug
    ELSE x.base_slug || '-' || x.slug_rank::text
  END,
  'simple',
  x.status,
  x.regular_price,
  x.cost_price,
  21,
  x.currency,
  x.description,
  x.specs,
  b.id,
  x.category_id,
  x.weight_kg,
  x.featured,
  true,
  'instock',
  COALESCE(x.created_at, now())
FROM prepared x
LEFT JOIN brands b ON b.slug = x.brand_slug
ON CONFLICT (id) DO NOTHING;

-- 15.4 Mapa N:N desde la categoría principal
INSERT INTO product_category_map (product_id, category_id)
SELECT p.id, p.primary_category_id
FROM products p
WHERE p.primary_category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 15.5 Warehouses — preserva id
INSERT INTO warehouses (id, company_id, code, name, address, city, country, active)
SELECT
  w.id, w.company_id, w.code, w.name, w.address, w.city,
  COALESCE(w.country, 'ES'),
  COALESCE(w.is_active, true)
FROM tt_warehouses w
ON CONFLICT (id) DO NOTHING;

-- 15.6 Stock sin variante (tt_stock no tiene variantes)
INSERT INTO stock_levels (warehouse_id, product_id, variant_id, quantity, reserved, min_qty, max_qty, last_counted_at)
SELECT
  s.warehouse_id,
  s.product_id,
  NULL::uuid,
  s.quantity,
  s.reserved,
  s.min_stock,
  NULLIF(s.max_stock, 0),
  s.last_counted_at
FROM tt_stock s
WHERE EXISTS (SELECT 1 FROM products   p WHERE p.id = s.product_id)
  AND EXISTS (SELECT 1 FROM warehouses w WHERE w.id = s.warehouse_id)
  AND NOT EXISTS (
    SELECT 1 FROM stock_levels sl
    WHERE sl.warehouse_id = s.warehouse_id
      AND sl.product_id   = s.product_id
      AND sl.variant_id IS NULL
  );

-- 15.7 Imagen destacada desde tt_products.image_url
INSERT INTO product_images (product_id, url, is_featured, sort_order)
SELECT p.id, p.image_url, true, 0
FROM tt_products p
WHERE p.image_url IS NOT NULL
  AND btrim(p.image_url) <> ''
  AND EXISTS (SELECT 1 FROM products np WHERE np.id = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM product_images pi
    WHERE pi.product_id = p.id AND pi.is_featured
  );

-- 15.8 Apunta products.thumbnail_media_id a la imagen destacada recién creada
UPDATE products np
SET thumbnail_media_id = (
  SELECT pi.id FROM product_images pi
  WHERE pi.product_id = np.id AND pi.is_featured
  ORDER BY pi.sort_order, pi.created_at
  LIMIT 1
)
WHERE np.thumbnail_media_id IS NULL
  AND EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = np.id AND pi.is_featured);

COMMIT;

-- =====================================================================
-- Fin migración v34
-- Siguiente paso: ejecutar queries de validación (Paso 2 del plan).
-- =====================================================================
