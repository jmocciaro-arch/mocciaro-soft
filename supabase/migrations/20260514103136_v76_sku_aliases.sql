CREATE TABLE IF NOT EXISTS tt_sku_aliases (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID         NOT NULL REFERENCES tt_companies(id) ON DELETE CASCADE,
  client_id     UUID         NULL REFERENCES tt_clients(id) ON DELETE CASCADE,
  external_sku  TEXT         NOT NULL,
  product_id    UUID         NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  source        TEXT         NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    UUID         NULL REFERENCES tt_users(id) ON DELETE SET NULL,
  notes         TEXT         NULL,
  CONSTRAINT tt_sku_aliases_unique UNIQUE (company_id, client_id, external_sku)
);

CREATE INDEX IF NOT EXISTS idx_tt_sku_aliases_lookup
  ON tt_sku_aliases (company_id, external_sku, client_id);

CREATE INDEX IF NOT EXISTS idx_tt_sku_aliases_product
  ON tt_sku_aliases (product_id);

COMMENT ON TABLE tt_sku_aliases IS
  'Historial de vinculaciones SKU del cliente -> producto del catalogo. Aprende del trabajo manual de conciliacion.';

COMMENT ON COLUMN tt_sku_aliases.client_id IS
  'NULL = alias global (aplica a cualquier cliente). Filled = alias especifico para ese cliente (prioridad).';

COMMENT ON COLUMN tt_sku_aliases.source IS
  'manual = usuario lo vinculo desde UI. import = vino con CSV/JSON. ai = sugerencia automatica aceptada.';
