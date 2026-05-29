-- Funcion que devuelve candidatos a duplicado al crear/editar un producto.
-- Score multi-criterio con razones explicadas. Pensada para llamarse desde el front
-- antes del INSERT/UPDATE.
CREATE OR REPLACE FUNCTION check_product_duplicates_candidates(
  p_sku               text DEFAULT NULL,
  p_name              text DEFAULT NULL,
  p_description       text DEFAULT NULL,
  p_ean               text DEFAULT NULL,
  p_barcode           text DEFAULT NULL,
  p_manufacturer_code text DEFAULT NULL,
  p_supplier_code     text DEFAULT NULL,
  p_brand             text DEFAULT NULL,
  p_price             numeric DEFAULT NULL,
  p_exclude_id        uuid    DEFAULT NULL,
  p_min_score         numeric DEFAULT 60,
  p_limit             integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_norm_sku  text := tt_norm_aggressive(coalesce(p_sku,''));
  v_norm_name text := tt_norm_aggressive(coalesce(p_name,''));
BEGIN
  WITH base AS (
    SELECT p.id, p.sku, p.name, p.brand, p.description, p.ean, p.barcode,
           p.manufacturer_code, p.supplier_code,
           p.price_eur, p.cost_eur, p.image_url, p.active, p.lifecycle_status,
           p.company_source, p.created_at
    FROM tt_products p
    WHERE p.merged_into_id IS NULL
      AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
  ),
  scored AS (
    SELECT
      b.*,
      -- Scoring por componentes (sumamos puntos por cada match)
      (
        CASE WHEN p_sku IS NOT NULL AND b.sku = p_sku THEN 100 ELSE 0 END
      + CASE WHEN p_sku IS NOT NULL AND v_norm_sku <> '' AND b.sku <> coalesce(p_sku,'')
              AND tt_norm_aggressive(b.sku) = v_norm_sku THEN 90 ELSE 0 END
      + CASE WHEN p_ean IS NOT NULL AND trim(p_ean) <> '' AND b.ean = p_ean THEN 100 ELSE 0 END
      + CASE WHEN p_barcode IS NOT NULL AND trim(p_barcode) <> '' AND b.barcode = p_barcode THEN 100 ELSE 0 END
      + CASE WHEN p_manufacturer_code IS NOT NULL AND trim(p_manufacturer_code) <> ''
              AND b.manufacturer_code = p_manufacturer_code THEN 85 ELSE 0 END
      + CASE WHEN p_supplier_code IS NOT NULL AND trim(p_supplier_code) <> ''
              AND b.supplier_code = p_supplier_code THEN 75 ELSE 0 END
      + CASE WHEN p_name IS NOT NULL AND v_norm_name <> ''
              AND tt_norm_aggressive(b.name) = v_norm_name THEN 70 ELSE 0 END
      + CASE WHEN p_name IS NOT NULL AND b.name IS NOT NULL
              AND tt_norm_aggressive(b.name) <> v_norm_name
              AND similarity(b.name, p_name) >= 0.6
             THEN ROUND(similarity(b.name, p_name) * 60)::int
             ELSE 0 END
      )::numeric AS base_score,
      -- Boosts (solo cuentan si ya hay un match base)
      CASE WHEN p_brand IS NOT NULL AND b.brand IS NOT NULL
            AND UPPER(b.brand) = UPPER(p_brand) THEN 10 ELSE 0 END AS brand_boost,
      CASE WHEN p_price IS NOT NULL AND p_price > 0 AND b.price_eur > 0
            AND ABS(b.price_eur - p_price) / NULLIF(p_price,0) <= 0.10
           THEN 5 ELSE 0 END AS price_boost,
      -- Razones (array de strings)
      ARRAY_REMOVE(ARRAY[
        CASE WHEN p_sku IS NOT NULL AND b.sku = p_sku
             THEN 'SKU exacto' END,
        CASE WHEN p_sku IS NOT NULL AND v_norm_sku <> '' AND b.sku <> coalesce(p_sku,'')
                  AND tt_norm_aggressive(b.sku) = v_norm_sku
             THEN 'SKU normalizado igual' END,
        CASE WHEN p_ean IS NOT NULL AND trim(p_ean) <> '' AND b.ean = p_ean
             THEN 'EAN coincide' END,
        CASE WHEN p_barcode IS NOT NULL AND trim(p_barcode) <> '' AND b.barcode = p_barcode
             THEN 'Codigo de barras coincide' END,
        CASE WHEN p_manufacturer_code IS NOT NULL AND trim(p_manufacturer_code) <> ''
                  AND b.manufacturer_code = p_manufacturer_code
             THEN 'Codigo fabricante coincide' END,
        CASE WHEN p_supplier_code IS NOT NULL AND trim(p_supplier_code) <> ''
                  AND b.supplier_code = p_supplier_code
             THEN 'Codigo proveedor coincide' END,
        CASE WHEN p_name IS NOT NULL AND v_norm_name <> ''
                  AND tt_norm_aggressive(b.name) = v_norm_name
             THEN 'Nombre normalizado igual' END,
        CASE WHEN p_name IS NOT NULL AND b.name IS NOT NULL
                  AND tt_norm_aggressive(b.name) <> v_norm_name
                  AND similarity(b.name, p_name) >= 0.6
             THEN 'Nombre similar (' || ROUND(similarity(b.name, p_name)*100)::text || '%)' END,
        CASE WHEN p_brand IS NOT NULL AND b.brand IS NOT NULL
                  AND UPPER(b.brand) = UPPER(p_brand)
             THEN 'Misma marca' END,
        CASE WHEN p_price IS NOT NULL AND p_price > 0 AND b.price_eur > 0
                  AND ABS(b.price_eur - p_price) / NULLIF(p_price,0) <= 0.10
             THEN 'Precio similar (+/-10%)' END
      ], NULL) AS reasons
    FROM base b
    WHERE
      -- Filtro previo barato: necesita al menos un punto base posible
      (p_sku IS NOT NULL AND (b.sku = p_sku OR (v_norm_sku <> '' AND tt_norm_aggressive(b.sku) = v_norm_sku)))
      OR (p_ean IS NOT NULL AND trim(p_ean) <> '' AND b.ean = p_ean)
      OR (p_barcode IS NOT NULL AND trim(p_barcode) <> '' AND b.barcode = p_barcode)
      OR (p_manufacturer_code IS NOT NULL AND trim(p_manufacturer_code) <> '' AND b.manufacturer_code = p_manufacturer_code)
      OR (p_supplier_code IS NOT NULL AND trim(p_supplier_code) <> '' AND b.supplier_code = p_supplier_code)
      OR (p_name IS NOT NULL AND b.name IS NOT NULL
          AND (tt_norm_aggressive(b.name) = v_norm_name OR similarity(b.name, p_name) >= 0.6))
  ),
  ranked AS (
    SELECT s.*,
           (s.base_score + CASE WHEN s.base_score > 0 THEN s.brand_boost + s.price_boost ELSE 0 END) AS final_score
    FROM scored s
    WHERE s.base_score >= p_min_score - 15 -- damos margen para que boosts ayuden a cruzar
  ),
  top AS (
    SELECT *
    FROM ranked
    WHERE final_score >= p_min_score
    ORDER BY final_score DESC, created_at ASC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'count', (SELECT COUNT(*) FROM top),
    'max_score', (SELECT COALESCE(MAX(final_score), 0) FROM top),
    'has_strong_match', EXISTS (SELECT 1 FROM top WHERE final_score >= 100),
    'candidates', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'sku', t.sku,
          'name', t.name,
          'brand', t.brand,
          'description', LEFT(COALESCE(t.description,''), 200),
          'ean', t.ean,
          'barcode', t.barcode,
          'manufacturer_code', t.manufacturer_code,
          'supplier_code', t.supplier_code,
          'price_eur', t.price_eur,
          'cost_eur', t.cost_eur,
          'image_url', t.image_url,
          'active', t.active,
          'lifecycle_status', t.lifecycle_status,
          'company_source', t.company_source,
          'score', t.final_score,
          'severity', CASE
                       WHEN t.final_score >= 100 THEN 'fuerte'
                       WHEN t.final_score >= 80  THEN 'medio'
                       ELSE 'debil' END,
          'reasons', to_jsonb(t.reasons),
          'total_doc_items', (SELECT COUNT(*) FROM tt_document_items di WHERE di.product_id=t.id),
          'total_stock', (SELECT COALESCE(SUM(quantity),0) FROM tt_stock st WHERE st.product_id=t.id)
        )
        ORDER BY t.final_score DESC, t.created_at ASC
      )
      FROM top t
    ), '[]'::jsonb)
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION check_product_duplicates_candidates IS
  'Devuelve candidatos a duplicado al crear/editar un producto con score multi-criterio (SKU, EAN, codigo fabricante/proveedor, nombre normalizado, similitud fuzzy, marca, precio). Score 100+ = casi seguro duplicado; 60+ = sospechoso.';
