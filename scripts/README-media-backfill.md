# Media de productos — setup en 3 pasos

Cuando apliques la migración v46, podés completar el rollout del módulo de
imágenes + diagramas en 3 pasos.

## 1) Aplicar la migración SQL

En Supabase → SQL Editor → pegar `supabase/migration-v46-product-media.sql` → Run.

Esto crea:
- Columnas `diagram_url` y `gallery_urls` en `tt_products`
- Tabla `tt_product_media` (photos, diagrams, renders, videos, documents)
- View `v_products_with_media`
- Policies RLS y trigger `updated_at`

## 2) Backfill de las imágenes ya cargadas

```bash
python3 scripts/backfill-product-media.py --dry-run   # verificar cuántas
python3 scripts/backfill-product-media.py             # ejecutar
```

Esto toma los ~2.121 productos que tienen `image_url` hoy y los replica como
filas en `tt_product_media` (kind=photo, is_primary=true). Idempotente: si lo
corrés dos veces, no duplica.

## 3) Probar el buscador público

```bash
npm run dev
```

Abrir `http://localhost:3000/buscador`:
- Facetas por marca / categoría / encastre con counts
- Búsqueda con debounce
- Modal con foto + diagrama lado a lado (estilo APEX)
- Galería multi-imagen desde `gallery_urls`

Y en el dashboard admin (`/catalogo` → Edit producto → tab Imágenes) ahora
podés cargar foto principal + diagrama técnico + galería.

## Próximos pasos sugeridos

- Script para importar diagramas desde los buscadores SPEEDRILL/APEX
  (ya tienen URLs de diagramas por SKU) al `tt_product_media`.
- Subida directa a Supabase Storage (bucket `product-media`).
- Ampliar el parser del buscador para sinónimos (socket=dado=tubo) igual que
  SPEEDRILL.
