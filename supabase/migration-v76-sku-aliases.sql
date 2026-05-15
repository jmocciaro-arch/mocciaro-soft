-- ============================================================================
-- MIGRACIÓN v76 — Historial de vinculación SKU del cliente → producto
-- ============================================================================
--
-- Cuando una OC del cliente trae un SKU que no matchea con tt_products,
-- el usuario lo vincula manualmente desde la grilla. Guardamos ese vínculo
-- acá para que la próxima OC con el mismo SKU del mismo cliente ya
-- aparezca matcheada en verde sin trabajo manual.
--
-- Granularidad:
--   - client_id = NULL  → alias GLOBAL (aplica para cualquier cliente)
--   - client_id != NULL → alias específico para ese cliente (gana prioridad)
--
-- El matcher prueba en este orden:
--   1) tt_sku_aliases (cliente_id = X) por external_sku
--   2) tt_sku_aliases (cliente_id = NULL) por external_sku
--   3) tt_products.sku exacto
-- ============================================================================

CREATE TABLE IF NOT EXISTS tt_sku_aliases (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID         NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  client_id     UUID         NULL REFERENCES tt_clients(id) ON DELETE CASCADE,
  external_sku  TEXT         NOT NULL,
  product_id    UUID         NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  source        TEXT         NOT NULL DEFAULT 'manual', -- 'manual' | 'import' | 'ai'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    UUID         NULL REFERENCES tt_users(id) ON DELETE SET NULL,
  notes         TEXT         NULL,

  -- Un alias por (company, client, external_sku). Si quieren cambiar el
  -- producto, se hace UPDATE no INSERT. NULL client_id usa el sentinel
  -- '00000000-0000-0000-0000-000000000000' para que el constraint funcione.
  CONSTRAINT tt_sku_aliases_unique UNIQUE (company_id, client_id, external_sku)
);

CREATE INDEX IF NOT EXISTS idx_tt_sku_aliases_lookup
  ON tt_sku_aliases (company_id, external_sku, client_id);

CREATE INDEX IF NOT EXISTS idx_tt_sku_aliases_product
  ON tt_sku_aliases (product_id);

COMMENT ON TABLE tt_sku_aliases IS
  'Historial de vinculaciones SKU del cliente → producto del catálogo. Aprende del trabajo manual de conciliación.';

COMMENT ON COLUMN tt_sku_aliases.client_id IS
  'NULL = alias global (aplica a cualquier cliente). Filled = alias específico para ese cliente (prioridad).';

COMMENT ON COLUMN tt_sku_aliases.source IS
  'manual = el usuario lo vinculó desde la UI. import = vino con un CSV/JSON. ai = sugerencia automática aceptada.';
