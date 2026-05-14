# Reporte de limpieza — 2026-05-14

Trabajo hecho en autonomía mientras estabas afuera.

---

## ✅ Lo que terminé

### 1. Feature: Contactos participantes en cotizaciones (Opción C)

**En el cotizador**, cuando seleccionás un cliente (ej. NORDEX), aparece debajo
una lista de sus contactos (Mariella Acuña, etc.) con checkboxes.

- Pre-selecciona automáticamente los marcados como `receives_quotes=true` o
  `is_primary`.
- Botón **"+ Nuevo contacto"** abre modal para crear al toque sin salir del
  cotizador (insert directo a `tt_client_contacts`).
- Al guardar la cotización, los IDs van a `tt_quotes.participating_contact_ids`
  (columna nueva).
- Al abrir el modal **"Enviar al cliente"**, los emails de los contactos
  marcados se pre-cargan como destinatarios TO (igual a la captura StelOrder
  que me pasaste con `orders@`, `mperreca@`, `epiantoni@`).

**Archivos tocados**:
- `supabase/migration-v80-quotes-participating-contacts.sql` (migración aplicada en prod)
- `src/app/(dashboard)/cotizador/page.tsx`
- `src/components/workflow/send-document-modal.tsx` (nuevo prop `extraRecipients`)

**Probarlo**:
1. Importar OC NORDEX en el cotizador
2. Confirmar cliente
3. Ver checkboxes con los contactos del cliente
4. Marcar/desmarcar / agregar uno nuevo
5. Guardar → Enviar al cliente → el modal arranca con los chips de email pre-cargados

---

### 2. Scripts de limpieza de productos (listos, NO ejecutados)

#### `scripts/consolidate-orphan-stock.ts`
Mueve las **8.475 entradas de stock** que apuntan a productos deduped al
producto winner. Detecta 2 casos:
- **UPDATE**: el winner no tiene stock en ese warehouse → reapunta `product_id`
- **MERGE**: el winner ya tiene stock → suma cantidades + borra el loser

**Para correrlo cuando vuelvas**:
```
export $(grep -v '^#' .env.local | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' | xargs)
SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" npx tsx scripts/consolidate-orphan-stock.ts          # dry-run
SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" npx tsx scripts/consolidate-orphan-stock.ts --apply  # aplicar
```

#### `scripts/detect-product-issues.ts` ✅ ya corrido
Reporte de calidad. CSVs generados en `out/`:
- `products-no-price.csv` — **9.472 productos sin precio_eur (99.7% de la base)**
- `products-no-brand.csv` — 0 productos sin marca ✅
- `products-no-description.csv` — 2 productos sin descripción
- `products-typo-duplicates.csv` — **966 grupos** con normalización idéntica
  que no se dedupearon (espacios extra, mayúsculas, etc.)
- `products-near-duplicates.csv` — 21.852 pares casi-idénticos (Lev ≤ 2)

---

## ⚠️ Hallazgo crítico: PRECIOS

**Solo 28 de 9.500 productos activos tienen precio_eur** (0.3%).

Las tablas `tt_product_prices`, `tt_price_lists`, `tt_client_prices`, etc.
están **vacías**. La migración de StelOrder no trajo los precios.

Es la causa de que la mayoría de cotizaciones tengan que ingresar precios a mano.

**Próximo paso recomendado**:
1. Exportar precios desde StelOrder (CSV con sku,price_eur,price_usd,cost_eur)
2. Te armo un script `import-prices-from-csv.ts` para cargarlos en masa
3. O hacer un fetch directo a la API de StelOrder

---

## 🎯 Qué te falta decidir cuando vuelvas

| # | Tema | Pregunta |
|---|---|---|
| 1 | **Stock huérfano** | ¿Aplico el consolidate? (8.475 entradas → ~3.000 después) |
| 2 | **Duplicados con typo** | ¿Revisas los 966 grupos manualmente o armo otro dedup automático con normalización más agresiva? |
| 3 | **Precios** | ¿De dónde los traemos? StelOrder CSV o API? |
| 4 | **Pares casi-idénticos** | 21.852 son muchos. ¿Querés revisar los top 50? (probablemente falsos positivos por nombres genéricos cortos) |

---

## 📦 Commits hechos hoy

```
e11f21b  feat(cotizador): contactos participantes del cliente estilo StelOrder (v80)
<próximo> chore(scripts): scripts de consolidación stock + detección de issues
```

Todo en rama `feat/iva-por-cliente-empresa`, PR #45.
