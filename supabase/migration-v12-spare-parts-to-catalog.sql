-- =====================================================
-- Migration v12: Mover repuestos SAT al Catalogo (tt_products)
-- =====================================================

-- 1) Borrar productos FEIN previos de migraciones anteriores (idempotente)
DELETE FROM tt_products
WHERE brand = 'FEIN'
  AND category = 'Repuestos FEIN'
  AND (specs->>'origen') = 'fein_sat_migration';

-- 2) Migrar tt_sat_spare_parts → tt_products (si la tabla existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tt_sat_spare_parts') THEN
    INSERT INTO tt_products (
      sku, name, description, brand, category, subcategory,
      cost_eur, price_eur, price_usd,
      image_url, modelo, specs, active
    )
    SELECT
      sp.sku,
      sp.descripcion,
      NULL,
      'FEIN',
      'Repuestos FEIN',
      sp.tipo,
      sp.precio_eur,
      sp.precio_eur,
      sp.precio_venta,
      sp.img_url,
      COALESCE(array_to_string(sp.modelos, ', '), ''),
      jsonb_build_object(
        'pos', sp.pos,
        'codigo_fein', sp.codigo,
        'modelos_compatibles', sp.modelos,
        'tipo', sp.tipo,
        'origen', 'fein_sat_migration'
      ),
      sp.active
    FROM tt_sat_spare_parts sp;
  END IF;
END
$$;

-- 3) Eliminar tt_sat_spare_parts (CASCADE cuelga indexes y policies)
DROP TABLE IF EXISTS tt_sat_spare_parts CASCADE;
