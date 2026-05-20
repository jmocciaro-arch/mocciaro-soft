-- ============================================================================
-- MIGRACIÓN v80b — Fix: ajustar nombres de columnas reales en find_duplicate_groups
-- ============================================================================
-- El schema "real" de tt_products usa:
--   - `active` (no `is_active`)
--   - `price_eur` (no `price_list`)
--   - `cost_eur` (no `price_cost`)
-- Esta migración recrea las funciones que dependen del schema.
-- ============================================================================

CREATE OR REPLACE FUNCTION find_duplicate_groups(
  p_mode TEXT DEFAULT 'aggressive',
  p_fuzzy_threshold FLOAT DEFAULT 0.85,
  p_limit_groups INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '[]'::jsonb;
BEGIN
  IF p_mode NOT IN ('exact', 'aggressive') THEN
    RAISE EXCEPTION 'mode must be exact or aggressive';
  END IF;

  WITH active_products AS (
    SELECT *
    FROM tt_products
    WHERE merged_into_id IS NULL
      AND active = true                                       -- ← fix
  ),

  group_by_ean AS (
    SELECT 'ean:' || ean AS group_key, 'ean' AS reason,
           array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE ean IS NOT NULL AND trim(ean) <> ''
    GROUP BY ean HAVING count(*) > 1
  ),

  group_by_mc AS (
    SELECT 'mc:' || manufacturer_code AS group_key, 'manufacturer_code' AS reason,
           array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE manufacturer_code IS NOT NULL AND trim(manufacturer_code) <> ''
    GROUP BY manufacturer_code HAVING count(*) > 1
  ),

  group_by_sku_norm AS (
    SELECT 'sku_norm:' || tt_norm_aggressive(sku) AS group_key, 'sku_norm' AS reason,
           array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE sku IS NOT NULL AND tt_norm_aggressive(sku) <> ''
    GROUP BY tt_norm_aggressive(sku) HAVING count(*) > 1
  ),

  group_by_name_norm AS (
    SELECT 'name_norm:' || tt_norm_aggressive(name) AS group_key, 'name_norm' AS reason,
           array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE name IS NOT NULL AND tt_norm_aggressive(name) <> ''
    GROUP BY tt_norm_aggressive(name) HAVING count(*) > 1
  ),

  group_by_fuzzy AS (
    SELECT 'fuzzy:' || a.id::text AS group_key, 'name_fuzzy' AS reason,
           ARRAY[a.id, b.id] AS product_ids
    FROM active_products a
    JOIN active_products b
      ON a.id < b.id
     AND similarity(a.name, b.name) >= p_fuzzy_threshold
     AND tt_norm_aggressive(a.name) <> tt_norm_aggressive(b.name)
    WHERE p_mode = 'aggressive'
      AND (tt_is_auto_sku(a.sku) OR tt_is_auto_sku(b.sku))
    LIMIT 500
  ),

  all_groups AS (
    SELECT * FROM group_by_ean
    UNION ALL SELECT * FROM group_by_mc
    UNION ALL SELECT * FROM group_by_sku_norm
    UNION ALL SELECT * FROM group_by_name_norm
    UNION ALL SELECT * FROM group_by_fuzzy
  )

  SELECT jsonb_agg(group_json ORDER BY group_size DESC, group_key)
    INTO v_result
  FROM (
    SELECT
      g.group_key,
      array_length(g.product_ids, 1) AS group_size,
      jsonb_build_object(
        'group_key', g.group_key,
        'reason', g.reason,
        'group_size', array_length(g.product_ids, 1),
        'products', (
          SELECT jsonb_agg(prod_json ORDER BY (prod_json->>'created_at'))
          FROM (
            SELECT jsonb_build_object(
              'id', p.id,
              'sku', p.sku,
              'name', p.name,
              'brand', p.brand,
              'price_list', p.price_eur,           -- ← fix: mapeo a price_eur
              'price_cost', p.cost_eur,            -- ← fix: mapeo a cost_eur
              'image_url', p.image_url,
              'description', p.description,
              'is_active', p.active,               -- ← fix: mapeo a active
              'created_at', p.created_at,
              'ean', p.ean,
              'manufacturer_code', p.manufacturer_code,
              'is_auto_sku', tt_is_auto_sku(p.sku),
              'total_doc_items', (SELECT count(*) FROM tt_document_items WHERE product_id = p.id),
              'total_stock', (SELECT coalesce(sum(quantity), 0) FROM tt_stock WHERE product_id = p.id),
              'usage_by_company', (
                SELECT coalesce(jsonb_object_agg(company_id::text, payload), '{}'::jsonb)
                FROM (
                  SELECT c.id AS company_id,
                    jsonb_build_object(
                      'name', c.name,
                      'docs', count(di.id) FILTER (WHERE di.id IS NOT NULL),
                      'stock_qty', coalesce(sum(st.quantity) FILTER (WHERE st.id IS NOT NULL), 0)
                    ) AS payload
                  FROM tt_companies c
                  LEFT JOIN tt_documents d ON d.company_id = c.id
                  LEFT JOIN tt_document_items di ON di.document_id = d.id AND di.product_id = p.id
                  LEFT JOIN tt_warehouses w ON w.company_id = c.id
                  LEFT JOIN tt_stock st ON st.warehouse_id = w.id AND st.product_id = p.id
                  GROUP BY c.id, c.name
                  HAVING count(di.id) FILTER (WHERE di.id IS NOT NULL) > 0
                      OR coalesce(sum(st.quantity) FILTER (WHERE st.id IS NOT NULL), 0) > 0
                ) usage_q
              )
            ) AS prod_json
            FROM tt_products p
            WHERE p.id = ANY(g.product_ids)
          ) sub
        )
      ) AS group_json
    FROM all_groups g
    ORDER BY array_length(g.product_ids, 1) DESC, g.group_key
    LIMIT p_limit_groups
  ) ranked;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

-- También recrear merge_products con `active` correcto
CREATE OR REPLACE FUNCTION merge_products(
  p_master_id    UUID,
  p_duplicate_ids UUID[],
  p_merged_by    UUID DEFAULT NULL,
  p_match_reason TEXT DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup_id UUID;
  v_master_exists BOOLEAN;
  v_dup_record RECORD;
  v_refs JSONB;
  v_count_dn INT;
  v_count_stock INT;
  v_count_alias INT;
  v_already_merged INT;
  v_merged_list JSONB := '[]'::jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM tt_products
    WHERE id = p_master_id AND merged_into_id IS NULL
  ) INTO v_master_exists;
  IF NOT v_master_exists THEN
    RAISE EXCEPTION 'Master product % does not exist or is already merged', p_master_id;
  END IF;
  IF p_master_id = ANY(p_duplicate_ids) THEN
    RAISE EXCEPTION 'Master cannot be in the duplicates list';
  END IF;

  FOREACH v_dup_id IN ARRAY p_duplicate_ids LOOP
    SELECT id, sku, name, active AS is_active   -- ← fix
      INTO v_dup_record
    FROM tt_products WHERE id = v_dup_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Duplicate product % does not exist', v_dup_id;
    END IF;

    SELECT count(*) INTO v_already_merged
    FROM tt_product_merge_log
    WHERE duplicate_id = v_dup_id AND reverted_at IS NULL;
    IF v_already_merged > 0 THEN CONTINUE; END IF;

    UPDATE tt_document_items SET product_id = p_master_id WHERE product_id = v_dup_id;
    GET DIAGNOSTICS v_count_dn = ROW_COUNT;

    UPDATE tt_document_item_components SET product_id = p_master_id WHERE product_id = v_dup_id;

    WITH conflicts AS (
      SELECT s_dup.warehouse_id, s_dup.quantity AS dup_qty, s_dup.reserved AS dup_res, s_dup.id AS dup_row_id
      FROM tt_stock s_dup
      JOIN tt_stock s_master ON s_master.product_id = p_master_id AND s_master.warehouse_id = s_dup.warehouse_id
      WHERE s_dup.product_id = v_dup_id
    ),
    summed AS (
      UPDATE tt_stock s_master
        SET quantity = s_master.quantity + c.dup_qty,
            reserved = s_master.reserved + c.dup_res,
            updated_at = NOW()
      FROM conflicts c
      WHERE s_master.product_id = p_master_id AND s_master.warehouse_id = c.warehouse_id
      RETURNING c.dup_row_id
    ),
    deleted AS (
      DELETE FROM tt_stock WHERE id IN (SELECT dup_row_id FROM summed) RETURNING id
    )
    SELECT count(*) INTO v_count_stock FROM deleted;

    UPDATE tt_stock SET product_id = p_master_id WHERE product_id = v_dup_id;

    DELETE FROM tt_sku_aliases dup_a
    WHERE dup_a.product_id = v_dup_id
      AND EXISTS (
        SELECT 1 FROM tt_sku_aliases m_a
        WHERE m_a.company_id = dup_a.company_id
          AND m_a.external_sku = dup_a.external_sku
          AND coalesce(m_a.client_id::text, '_') = coalesce(dup_a.client_id::text, '_')
          AND m_a.product_id = p_master_id
      );
    UPDATE tt_sku_aliases SET product_id = p_master_id WHERE product_id = v_dup_id;
    GET DIAGNOSTICS v_count_alias = ROW_COUNT;

    INSERT INTO tt_sku_aliases (company_id, client_id, external_sku, product_id, source, notes)
    SELECT c.id, NULL, v_dup_record.sku, p_master_id, 'merge',
           'Auto-creado por merge de ' || v_dup_record.sku
    FROM tt_companies c
    ON CONFLICT (company_id, client_id, external_sku) DO NOTHING;

    v_refs := jsonb_build_object(
      'tt_document_items', v_count_dn,
      'tt_stock_merged', v_count_stock,
      'tt_sku_aliases', v_count_alias
    );

    UPDATE tt_products
      SET active          = false,                            -- ← fix
          merged_into_id  = p_master_id,
          merged_at       = NOW(),
          merged_by       = p_merged_by,
          name            = CASE WHEN name LIKE '[DEDUPED]%' THEN name
                                 ELSE '[DEDUPED] ' || name END,
          updated_at      = NOW()
      WHERE id = v_dup_id;

    INSERT INTO tt_product_merge_log (
      master_id, duplicate_id, merged_by,
      prev_name, prev_sku, prev_active,
      refs_moved, match_reason, notes
    ) VALUES (
      p_master_id, v_dup_id, p_merged_by,
      v_dup_record.name, v_dup_record.sku, v_dup_record.is_active,
      v_refs, p_match_reason, p_notes
    );

    v_merged_list := v_merged_list || jsonb_build_object(
      'duplicate_id', v_dup_id, 'prev_sku', v_dup_record.sku, 'refs', v_refs
    );
  END LOOP;

  RETURN jsonb_build_object(
    'master_id', p_master_id,
    'merged_count', jsonb_array_length(v_merged_list),
    'merged', v_merged_list
  );
END;
$$;

-- También revert
CREATE OR REPLACE FUNCTION revert_product_merge(p_log_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
BEGIN
  SELECT * INTO v_log FROM tt_product_merge_log WHERE id = p_log_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Merge log % not found', p_log_id; END IF;
  IF v_log.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Merge log % already reverted at %', p_log_id, v_log.reverted_at;
  END IF;

  UPDATE tt_products
    SET active         = v_log.prev_active,                   -- ← fix
        name           = v_log.prev_name,
        merged_into_id = NULL,
        merged_at      = NULL,
        merged_by      = NULL,
        updated_at     = NOW()
    WHERE id = v_log.duplicate_id;

  UPDATE tt_product_merge_log SET reverted_at = NOW() WHERE id = p_log_id;

  RETURN jsonb_build_object(
    'reverted', true,
    'duplicate_id', v_log.duplicate_id,
    'warning', 'Las refs FK NO se movieron de vuelta. El maestro mantiene todo el historial.'
  );
END;
$$;
