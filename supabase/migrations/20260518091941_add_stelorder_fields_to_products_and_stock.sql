-- Columnas StelOrder en tt_products
ALTER TABLE tt_products
  ADD COLUMN IF NOT EXISTS private_notes              text,
  ADD COLUMN IF NOT EXISTS discount_pct               numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate                   numeric  DEFAULT 21,
  ADD COLUMN IF NOT EXISTS accounting_sale_account    text,
  ADD COLUMN IF NOT EXISTS accounting_purchase_account text,
  ADD COLUMN IF NOT EXISTS shop_visible               boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS shop_featured              boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS shop_visibility            text,
  ADD COLUMN IF NOT EXISTS shop_name                  text,
  ADD COLUMN IF NOT EXISTS shop_description           text,
  ADD COLUMN IF NOT EXISTS shop_description_long      text,
  ADD COLUMN IF NOT EXISTS shop_url                   text,
  ADD COLUMN IF NOT EXISTS shop_seo_title             text,
  ADD COLUMN IF NOT EXISTS shop_seo_description       text;

-- Columnas en tt_stock
ALTER TABLE tt_stock
  ADD COLUMN IF NOT EXISTS virtual_quantity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location         text;

COMMENT ON COLUMN tt_products.discount_pct IS 'Descuento por defecto del producto (StelOrder)';
COMMENT ON COLUMN tt_products.tax_rate IS 'Porcentaje de IVA (StelOrder)';
COMMENT ON COLUMN tt_stock.virtual_quantity IS 'Stock virtual (stock real menos reservas pendientes, StelOrder)';
COMMENT ON COLUMN tt_stock.location IS 'Ubicacion fisica dentro del almacen';
