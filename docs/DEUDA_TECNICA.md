# Deuda técnica — Mocciaro Soft

Documento vivo. Cada entrada con fecha de detección, contexto y propuesta.

---

## 🔴 Browser Supabase client usado en archivos compartidos frontend+backend

**Detectado**: 2026-05-24 durante validación F1 (Next-Step Suggester).

**Síntoma**: cuando se aplicó RLS a `tt_documents`, la función `quoteToOrder()` (en `src/lib/document-workflow.ts`) dejó de funcionar al ser llamada desde un API route porque importa el cliente del browser (`@/lib/supabase/client`) que no lleva las cookies del user → consultas van como anónimo → RLS bloquea.

**Hotfix aplicado**: agregar parámetro opcional `supabaseClient` a `quoteToOrder()` para que los endpoints le pasen el server client. Funciona pero es parche.

**20 archivos con el mismo anti-pattern** (todos importan `@/lib/supabase/client`):

```
src/lib/document-workflow.ts          ← ya tiene workaround (parámetro opcional)
src/lib/doc-numbering.ts
src/lib/intercompany.ts
src/lib/rbac.ts
src/lib/import-jobs.ts
src/lib/import-templates.ts
src/lib/scheduled-exports.ts
src/lib/stock-transactions.ts
src/lib/document-attachments.ts
src/lib/product-translations.ts
src/lib/product-serials.ts
src/lib/product-lots.ts
src/lib/product-variants.ts
src/lib/process-engine.ts
src/lib/fuzzy-duplicates.ts
src/lib/visual-workflow.ts
src/lib/catalog-rules-engine.ts
src/lib/cache/fetchers.ts
src/lib/offline/sync-queue.ts          ← legítimo (es offline en browser)
src/lib/company-context.tsx            ← legítimo (es client component)
```

De los 20, **18 son problemáticos** (cualquier uso desde API route con RLS activa va a fallar). 2 son legítimos (offline + client component).

**Impacto**: cuando se apliquen las policies RLS de v86 a más tablas (`tt_invoices`, `tt_payments`, `tt_bank_movements`, `tt_clients`, `tt_purchase_invoices`), todas las funciones de `src/lib/*` que tocan esas tablas desde endpoints van a romper en cadena.

**Propuesta de fix**:

1. **Patrón estándar**: cada función helper en `lib/*` que pueda llamarse desde server debe aceptar `supabaseClient?` opcional. Si no se pasa, usa `createClient()` del browser. Si sí, usa el provisto. Igual que hicimos en `quoteToOrder`.

2. **Refactor masivo (sesión dedicada ~3-4h)**: agregar parámetro opcional a las 18 funciones expuestas + actualizar endpoints que las llaman para pasar `await createServerClient()`.

3. **Mientras tanto**: si se aplica v86, esperar errores cascada en endpoints y arreglar reactivamente uno por uno.

**Recomendación**: priorizar 1+2 **antes** de aplicar v86 RLS críticas, sino el sistema se rompe en varios lugares simultáneamente.

---

## 🟡 Tabla duplicada: `tt_document_items` vs `tt_document_lines`

**Detectado**: 2026-05-24 durante creación de fixture COT-TEST-F1.

Ambas tablas tienen schema idéntico (`id, document_id, sku, description, quantity, unit_price, subtotal, sort_order, qty_*, ...`). Probablemente una es legacy y la otra nueva, pero ambas coexisten activamente en el código:

- `document-workflow.ts:158` usa `tt_document_lines`
- Otros archivos usan `tt_document_items`

**Propuesta**: identificar cuál es la canónica, migrar datos de la otra, y dropear la duplicada con FK redirect.

---

## 🟢 v86 RLS críticas pendiente

5 tablas críticas siguen sin RLS: `tt_invoices`, `tt_payments`, `tt_bank_movements`, `tt_clients`, `tt_purchase_invoices`. Migración `v86_enable_rls_critical_tables.sql` generada pero NO aplicada. Requiere smoke test multi-user antes.

**Bloqueante implícito**: la deuda del browser client (arriba) hace que aplicar v86 sin antes refactorizar `lib/*` rompa endpoints en cadena.

---

## 🟢 Numeración atómica (sequences) pendiente

`generateDocNumber()` centralizado en `src/lib/doc-numbering.ts` pero todavía usa MAX+1 (no `tt_document_sequences`). Race condition latente con varios users concurrentes. Migración futura para mover a `UPDATE ... RETURNING` atómico.
