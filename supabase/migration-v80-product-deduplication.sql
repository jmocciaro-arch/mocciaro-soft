-- ============================================================================
-- MIGRACIÓN v80 — Sistema de deduplicación de productos (con archivo)
-- ============================================================================
--
-- Permite:
--   1. Detectar grupos de productos duplicados (exactos + fuzzy nombre/sku).
--   2. Ver uso por empresa vendedora (Torquetools, Buscatools, Torquear) de
--      cada candidato — pista para entender de qué importación vino.
--   3. Mergear duplicados en un "maestro" con archivo reversible:
--      - Mueve todas las referencias FK (document_items, stock, aliases, etc.)
--      - Marca el duplicado como inactivo con prefijo [DEDUPED] en el nombre
--      - Guarda log para revertir
--
-- Decisiones de diseño:
--   - `tt_products` no tiene company_id (los productos son globales entre las
--     3 empresas). La pertenencia a empresa se infiere por uso en documentos.
--   - El merge NO borra filas: las marca inactivas con merged_into_id apuntando
--     al maestro. Esto permite reversión.
-- ============================================================================

-- 0. Extensiones requeridas (deben crearse ANTES de las funciones que las usan)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Columnas de archivo en tt_products
ALTER TABLE tt_products
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES tt_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS merged_by      UUID NULL REFERENCES tt_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tt_products_merged_into ON tt_products(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

COMMENT ON COLUMN tt_products.merged_into_id IS
  'Si está seteado, este producto fue archivado como duplicado de merged_into_id. is_active=false.';

-- 2. Log de merges para reversión
CREATE TABLE IF NOT EXISTS tt_product_merge_log (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id     UUID         NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  duplicate_id  UUID         NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  merged_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  merged_by     UUID         NULL REFERENCES tt_users(id) ON DELETE SET NULL,

  -- Snapshot del duplicado ANTES del merge (para reversión)
  prev_name     TEXT         NOT NULL,
  prev_sku      TEXT         NOT NULL,
  prev_active   BOOLEAN      NOT NULL,

  -- Conteo de refs movidas por tabla: {"tt_document_items": 23, "tt_stock": 2, ...}
  refs_moved    JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- Razón del merge (qué hizo match): ean | manufacturer_code | sku_exact | name_exact | name_fuzzy
  match_reason  TEXT         NULL,

  notes         TEXT         NULL,
  reverted_at   TIMESTAMPTZ  NULL,

  UNIQUE (duplicate_id)  -- un producto sólo puede mergearse una vez (mientras no se revierta)
);

CREATE INDEX IF NOT EXISTS idx_merge_log_master ON tt_product_merge_log(master_id);
CREATE INDEX IF NOT EXISTS idx_merge_log_merged_at ON tt_product_merge_log(merged_at DESC);

COMMENT ON TABLE tt_product_merge_log IS
  'Historial de merges de duplicados. Permite revertir un merge si se hizo por error.';

-- ============================================================================
-- 3. Función helper: normalización agresiva
-- ============================================================================
-- Lowercase + sin acentos + solo alfanuméricos. Usada para detectar duplicados
-- con typo / variantes de espacios / mayúsculas.
CREATE OR REPLACE FUNCTION tt_norm_aggressive(s TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(
    unaccent(coalesce(s, '')),
    '[^a-zA-Z0-9]', '', 'g'
  ))
$$;

-- Heurística: detecta SKUs auto-generados de la migración inicial
-- (PROXXXX, COSTOXXXX, GASTOXX, SVCXXXX, SRVXXXX) que casi siempre son
-- placeholders sin código real → candidatos preferentes a ser duplicados.
CREATE OR REPLACE FUNCTION tt_is_auto_sku(sku TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT sku ~* '^(PRO|COSTO|GASTO|SVC|SRV)\d{3,}$'
$$;

-- ============================================================================
-- 4. RPC: find_duplicate_groups
-- ============================================================================
-- Retorna grupos de productos candidatos a ser duplicados, con conteo de uso
-- por empresa de cada miembro.
--
-- Modos:
--   'exact'     → solo matches exactos (EAN, manuf_code, SKU normalizado, name normalizado)
--   'aggressive'→ exact + fuzzy de nombre via pg_trgm + matches de auto-SKUs por nombre
--
-- Output: jsonb array de grupos. Cada grupo:
-- {
--   "group_key": "ean:1234567890123" | "name_norm:..." | "trgm:<id1>",
--   "reason": "ean" | "manufacturer_code" | "sku_norm" | "name_norm" | "name_fuzzy" | "auto_sku_name",
--   "products": [
--     {
--       "id": "...", "sku": "...", "name": "...", "brand": "...",
--       "price_list": 12.5, "price_cost": 8.0, "image_url": "...",
--       "is_active": true, "created_at": "...", "is_auto_sku": false,
--       "usage_by_company": {"<company_id>": {"name": "Torquetools", "docs": 12, "stock_qty": 30}},
--       "total_doc_items": 12, "total_stock": 30
--     }
--   ]
-- }
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
  v_group RECORD;
  v_products JSONB;
BEGIN
  -- Validar modo
  IF p_mode NOT IN ('exact', 'aggressive') THEN
    RAISE EXCEPTION 'mode must be exact or aggressive';
  END IF;

  -- ── Detectar grupos por distintas reglas y unirlos en una CTE ──
  WITH active_products AS (
    SELECT *
    FROM tt_products
    WHERE merged_into_id IS NULL  -- excluir ya mergeados
      AND is_active = true
  ),

  -- A) Grupos por EAN exacto
  group_by_ean AS (
    SELECT
      'ean:' || ean AS group_key,
      'ean' AS reason,
      array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE ean IS NOT NULL AND trim(ean) <> ''
    GROUP BY ean
    HAVING count(*) > 1
  ),

  -- B) Grupos por manufacturer_code exacto
  group_by_mc AS (
    SELECT
      'mc:' || manufacturer_code AS group_key,
      'manufacturer_code' AS reason,
      array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE manufacturer_code IS NOT NULL AND trim(manufacturer_code) <> ''
    GROUP BY manufacturer_code
    HAVING count(*) > 1
  ),

  -- C) Grupos por SKU normalizado (case-insensitive, sin separadores)
  group_by_sku_norm AS (
    SELECT
      'sku_norm:' || tt_norm_aggressive(sku) AS group_key,
      'sku_norm' AS reason,
      array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE sku IS NOT NULL AND tt_norm_aggressive(sku) <> ''
    GROUP BY tt_norm_aggressive(sku)
    HAVING count(*) > 1
  ),

  -- D) Grupos por nombre normalizado agresivo
  group_by_name_norm AS (
    SELECT
      'name_norm:' || tt_norm_aggressive(name) AS group_key,
      'name_norm' AS reason,
      array_agg(id ORDER BY created_at) AS product_ids
    FROM active_products
    WHERE name IS NOT NULL AND tt_norm_aggressive(name) <> ''
    GROUP BY tt_norm_aggressive(name)
    HAVING count(*) > 1
  ),

  -- E) Modo agresivo: pares con auto-SKU + nombre normalizado similar
  --    (solo se evalúa si p_mode='aggressive')
  group_by_fuzzy AS (
    SELECT
      'fuzzy:' || a.id::text AS group_key,
      'name_fuzzy' AS reason,
      ARRAY[a.id, b.id] AS product_ids
    FROM active_products a
    JOIN active_products b
      ON a.id < b.id
     AND similarity(a.name, b.name) >= p_fuzzy_threshold
     AND tt_norm_aggressive(a.name) <> tt_norm_aggressive(b.name)  -- no ya cubierto por D
    WHERE p_mode = 'aggressive'
      AND (tt_is_auto_sku(a.sku) OR tt_is_auto_sku(b.sku))
    LIMIT 500  -- cap defensivo, fuzzy es O(n²)
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
              'price_list', p.price_list,
              'price_cost', p.price_cost,
              'image_url', p.image_url,
              'description', p.description,
              'is_active', p.is_active,
              'created_at', p.created_at,
              'ean', p.ean,
              'manufacturer_code', p.manufacturer_code,
              'is_auto_sku', tt_is_auto_sku(p.sku),
              'total_doc_items', (
                SELECT count(*) FROM tt_document_items WHERE product_id = p.id
              ),
              'total_stock', (
                SELECT coalesce(sum(quantity), 0) FROM tt_stock WHERE product_id = p.id
              ),
              'usage_by_company', (
                SELECT coalesce(jsonb_object_agg(company_id::text, payload), '{}'::jsonb)
                FROM (
                  SELECT
                    c.id AS company_id,
                    jsonb_build_object(
                      'name', c.name,
                      'docs', count(di.id) FILTER (WHERE di.id IS NOT NULL),
                      'stock_qty', coalesce(sum(st.quantity) FILTER (WHERE st.id IS NOT NULL), 0)
                    ) AS payload
                  FROM tt_companies c
                  LEFT JOIN tt_documents d
                    ON d.company_id = c.id
                  LEFT JOIN tt_document_items di
                    ON di.document_id = d.id AND di.product_id = p.id
                  LEFT JOIN tt_warehouses w
                    ON w.company_id = c.id
                  LEFT JOIN tt_stock st
                    ON st.warehouse_id = w.id AND st.product_id = p.id
                  GROUP BY c.id, c.name
                  HAVING count(di.id) FILTER (WHERE di.id IS NOT NULL) > 0
                      OR coalesce(sum(st.quantity) FILTER (WHERE st.id IS NOT NULL), 0) > 0
                ) usage
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

COMMENT ON FUNCTION find_duplicate_groups IS
  'Detecta grupos de productos duplicados con conteo de uso por empresa. Modos: exact (sin fuzzy) | aggressive (incluye Levenshtein/trgm + auto-SKUs).';

-- ============================================================================
-- 5. RPC: merge_products
-- ============================================================================
-- Fusiona N duplicados en un maestro. Operación transaccional:
--   1. Mueve product_id de todas las tablas hijas al maestro
--   2. Para tt_stock: suma quantities por warehouse (no conflicta con UNIQUE)
--   3. Marca cada duplicado: is_active=false, merged_into_id=master,
--      name='[DEDUPED] <prev_name>'
--   4. Loguea cada merge en tt_product_merge_log
--
-- Si algo falla, ROLLBACK automático.
--
-- Retorna jsonb con resumen: {"master_id": "...", "merged_count": N, "refs": {...}}
-- ============================================================================
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
  v_summary JSONB := jsonb_build_object('merged', '[]'::jsonb);
  v_already_merged INT;
  v_merged_list JSONB := '[]'::jsonb;
BEGIN
  -- Validar maestro
  SELECT EXISTS(
    SELECT 1 FROM tt_products
    WHERE id = p_master_id AND merged_into_id IS NULL
  ) INTO v_master_exists;

  IF NOT v_master_exists THEN
    RAISE EXCEPTION 'Master product % does not exist or is already merged', p_master_id;
  END IF;

  -- Validar que no haya overlap
  IF p_master_id = ANY(p_duplicate_ids) THEN
    RAISE EXCEPTION 'Master cannot be in the duplicates list';
  END IF;

  -- Procesar cada duplicado
  FOREACH v_dup_id IN ARRAY p_duplicate_ids LOOP
    -- Snapshot previo (para rollback)
    SELECT id, sku, name, is_active
      INTO v_dup_record
    FROM tt_products
    WHERE id = v_dup_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Duplicate product % does not exist', v_dup_id;
    END IF;

    -- Si ya fue mergeado, saltarlo silenciosamente
    SELECT count(*) INTO v_already_merged
    FROM tt_product_merge_log
    WHERE duplicate_id = v_dup_id AND reverted_at IS NULL;

    IF v_already_merged > 0 THEN
      CONTINUE;
    END IF;

    -- 1) tt_document_items: reasignar a master
    UPDATE tt_document_items
      SET product_id = p_master_id
      WHERE product_id = v_dup_id;
    GET DIAGNOSTICS v_count_dn = ROW_COUNT;

    -- 2) tt_document_item_components: reasignar
    UPDATE tt_document_item_components
      SET product_id = p_master_id
      WHERE product_id = v_dup_id;

    -- 3) tt_stock: sumar quantities por warehouse, evitar conflicto UNIQUE
    -- Para cada warehouse donde el duplicado tiene stock:
    --   si el master ya tiene stock allí → sumar y borrar la fila del duplicado
    --   si no → reasignar product_id al master
    WITH conflicts AS (
      SELECT s_dup.warehouse_id, s_dup.quantity AS dup_qty, s_dup.reserved AS dup_res, s_dup.id AS dup_row_id
      FROM tt_stock s_dup
      JOIN tt_stock s_master
        ON s_master.product_id = p_master_id
       AND s_master.warehouse_id = s_dup.warehouse_id
      WHERE s_dup.product_id = v_dup_id
    ),
    summed AS (
      UPDATE tt_stock s_master
        SET quantity = s_master.quantity + c.dup_qty,
            reserved = s_master.reserved + c.dup_res,
            updated_at = NOW()
      FROM conflicts c
      WHERE s_master.product_id = p_master_id
        AND s_master.warehouse_id = c.warehouse_id
      RETURNING c.dup_row_id
    ),
    deleted AS (
      DELETE FROM tt_stock
      WHERE id IN (SELECT dup_row_id FROM summed)
      RETURNING id
    )
    SELECT count(*) INTO v_count_stock FROM deleted;

    -- Para los warehouses sin conflicto, simplemente reasignar
    UPDATE tt_stock
      SET product_id = p_master_id
      WHERE product_id = v_dup_id;

    -- 4) tt_sku_aliases: reasignar (puede haber conflicto UNIQUE → en ese caso borrar)
    DELETE FROM tt_sku_aliases dup_a
    WHERE dup_a.product_id = v_dup_id
      AND EXISTS (
        SELECT 1 FROM tt_sku_aliases m_a
        WHERE m_a.company_id = dup_a.company_id
          AND m_a.external_sku = dup_a.external_sku
          AND coalesce(m_a.client_id::text, '∅') = coalesce(dup_a.client_id::text, '∅')
          AND m_a.product_id = p_master_id
      );
    UPDATE tt_sku_aliases
      SET product_id = p_master_id
      WHERE product_id = v_dup_id;
    GET DIAGNOSTICS v_count_alias = ROW_COUNT;

    -- 5) Crear un alias del SKU viejo del duplicado → master, para que futuras
    --    importaciones que vengan con el SKU viejo apunten al master
    INSERT INTO tt_sku_aliases (company_id, client_id, external_sku, product_id, source, notes)
    SELECT
      c.id,
      NULL,
      v_dup_record.sku,
      p_master_id,
      'merge',
      'Auto-creado por merge de ' || v_dup_record.sku || ' → master'
    FROM tt_companies c
    ON CONFLICT (company_id, client_id, external_sku) DO NOTHING;

    -- 6) Refs jsonb para el log
    v_refs := jsonb_build_object(
      'tt_document_items', v_count_dn,
      'tt_stock_merged', v_count_stock,
      'tt_sku_aliases', v_count_alias
    );

    -- 7) Archivar el duplicado
    UPDATE tt_products
      SET is_active       = false,
          merged_into_id  = p_master_id,
          merged_at       = NOW(),
          merged_by       = p_merged_by,
          name            = CASE
                              WHEN name LIKE '[DEDUPED]%' THEN name
                              ELSE '[DEDUPED] ' || name
                            END,
          updated_at      = NOW()
      WHERE id = v_dup_id;

    -- 8) Log
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
      'duplicate_id', v_dup_id,
      'prev_sku', v_dup_record.sku,
      'refs', v_refs
    );
  END LOOP;

  RETURN jsonb_build_object(
    'master_id', p_master_id,
    'merged_count', jsonb_array_length(v_merged_list),
    'merged', v_merged_list
  );
END;
$$;

COMMENT ON FUNCTION merge_products IS
  'Fusiona N duplicados en un maestro. Mueve refs FK, suma stock por warehouse, marca duplicados como [DEDUPED] inactivos. Reversible vía revert_product_merge.';

-- ============================================================================
-- 6. RPC: revert_product_merge
-- ============================================================================
-- Revierte UN merge: restaura el duplicado, pero NO mueve las refs FK de vuelta
-- (eso sería caro y propenso a errores). El usuario debe entender que revertir
-- solo "des-archiva" el producto duplicado para volver a editarlo / reusarlo.
-- ============================================================================
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merge log % not found', p_log_id;
  END IF;
  IF v_log.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Merge log % already reverted at %', p_log_id, v_log.reverted_at;
  END IF;

  UPDATE tt_products
    SET is_active      = v_log.prev_active,
        name           = v_log.prev_name,
        merged_into_id = NULL,
        merged_at      = NULL,
        merged_by      = NULL,
        updated_at     = NOW()
    WHERE id = v_log.duplicate_id;

  UPDATE tt_product_merge_log
    SET reverted_at = NOW()
    WHERE id = p_log_id;

  RETURN jsonb_build_object(
    'reverted', true,
    'duplicate_id', v_log.duplicate_id,
    'warning', 'Las referencias FK NO se movieron de vuelta. El maestro mantiene todo el historial.'
  );
END;
$$;

-- ============================================================================
-- 7. RLS para tt_product_merge_log
-- ============================================================================
ALTER TABLE tt_product_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merge log readable by authenticated"
  ON tt_product_merge_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "merge log writable by authenticated"
  ON tt_product_merge_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Extensiones ya creadas al inicio (unaccent, pg_trgm).
-- ============================================================================
