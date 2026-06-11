-- migration-v70-channel-listings-ml-sync.sql
-- Habilita el espejo de publicaciones de MercadoLibre en tt_channel_listings.
--
-- WHY product_id nullable: hasta ahora una publicación se daba de alta a mano
-- vinculada SIEMPRE a un producto del catálogo. Para traer TODAS las
-- publicaciones de ML (decisión de negocio jun 2026), las que no tengan un
-- producto equivalente deben poder existir igual. El auto-vínculo por SKU
-- (tt_products.sku, catálogo global sin company_id) setea product_id cuando hay
-- match; si no, queda NULL.
--
-- WHY índice único parcial: el sync hace UPSERT por (channel_id, external_id)
-- — external_id es el item de ML (MLAxx␣). El índice lo hace idempotente y
-- evita duplicar al re-sincronizar. Parcial (external_id NOT NULL) para no
-- chocar con las publicaciones manuales legacy que no tienen external_id.

ALTER TABLE tt_channel_listings ALTER COLUMN product_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_channel_listings_channel_external
  ON tt_channel_listings (channel_id, external_id)
  WHERE external_id IS NOT NULL;

-- ROLLBACK:
-- DROP INDEX IF EXISTS ux_channel_listings_channel_external;
-- -- Solo si no se insertaron filas con product_id NULL todavía:
-- ALTER TABLE tt_channel_listings ALTER COLUMN product_id SET NOT NULL;
