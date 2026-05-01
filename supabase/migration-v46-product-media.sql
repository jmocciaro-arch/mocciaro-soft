-- ================================================================
-- MIGRATION V46 — Multimedia de productos (galeria + diagramas)
-- Permite asociar multiples imagenes y diagramas tecnicos por SKU,
-- replicando la UX del buscador SPEEDRILL/APEX dentro del cotizador.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1) Columnas rapidas en tt_products (para productos simples)
-- ----------------------------------------------------------------
-- diagram_url  : URL del diagrama tecnico principal (PNG/JPG/SVG)
-- gallery_urls : array JSON con imagenes secundarias tipo
--                [{url, alt, sort_order}]
-- Se mantiene image_url como foto principal (ya existente).
ALTER TABLE tt_products
  ADD COLUMN IF NOT EXISTS diagram_url  text,
  ADD COLUMN IF NOT EXISTS gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tt_products.diagram_url  IS 'Diagrama tecnico principal con medidas (A,B,C,D)';
COMMENT ON COLUMN tt_products.gallery_urls IS 'Array de {url, alt, sort_order} para galeria multi-imagen';

-- ----------------------------------------------------------------
-- 2) Tabla dedicada para productos con muchos assets / variantes
--    (opcional, para casos avanzados: APEX con 3 diagramas por SKU,
--     renders 360, fotos de aplicacion, etc.)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tt_product_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('photo','diagram','render','video','document')),
  url          text NOT NULL,
  alt          text,
  caption      text,
  label        text,                  -- 'A', 'B', 'Overall length', etc.
  is_primary   boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_media_product ON tt_product_media(product_id, kind, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_media_primary ON tt_product_media(product_id) WHERE is_primary = true;

-- Solo puede haber un is_primary=true por (product_id, kind)
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_media_primary
  ON tt_product_media(product_id, kind)
  WHERE is_primary = true;

-- ----------------------------------------------------------------
-- 3) Trigger updated_at
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION tt_product_media_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_media_touch ON tt_product_media;
CREATE TRIGGER trg_product_media_touch
  BEFORE UPDATE ON tt_product_media
  FOR EACH ROW EXECUTE FUNCTION tt_product_media_touch();

-- ----------------------------------------------------------------
-- 4) RLS: mismo criterio que tt_products (lectura autenticada)
-- ----------------------------------------------------------------
ALTER TABLE tt_product_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_media_read" ON tt_product_media;
CREATE POLICY "product_media_read"
  ON tt_product_media FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "product_media_write" ON tt_product_media;
CREATE POLICY "product_media_write"
  ON tt_product_media FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------
-- 5) View helper: producto + media agrupado
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_products_with_media AS
SELECT
  p.*,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'url', m.url, 'alt', m.alt,
        'label', m.label, 'is_primary', m.is_primary, 'sort_order', m.sort_order
     ) ORDER BY m.kind, m.sort_order)
     FROM tt_product_media m WHERE m.product_id = p.id),
    '[]'::jsonb
  ) AS media
FROM tt_products p;

COMMIT;

-- ================================================================
-- ROLLBACK (por si hace falta):
--   ALTER TABLE tt_products DROP COLUMN IF EXISTS diagram_url;
--   ALTER TABLE tt_products DROP COLUMN IF EXISTS gallery_urls;
--   DROP VIEW  IF EXISTS v_products_with_media;
--   DROP TABLE IF EXISTS tt_product_media CASCADE;
-- ================================================================
