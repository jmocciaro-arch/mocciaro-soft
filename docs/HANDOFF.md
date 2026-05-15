# HANDOFF / Quickstart

Notas vivas para retomar contexto entre sesiones. Lo más reciente arriba.

---

## 2026-05-11 — Auditoría externa desactualizada: 4 puntos ya resueltos en `main`

Una auditoría/lista de fixes externa pidió aplicar estos cambios. **Verificado contra `main` el 2026-05-11: ya están resueltos. NO RE-APLICAR.**

| # | Pedido | Estado real |
|---|---|---|
| A | Cambiar `line_number` por `sort_order` en `src/components/documentos/document-detail-modal.tsx` | El archivo solo usa `sort_order` (líneas 40, 134, 233, 387). No hay `line_number` ahí. |
| B | Aplicar signed URLs en `src/app/api/bank-statements/parse/route.ts` | Ya usa `createSignedUrl` (línea 56). Sin `getPublicUrl`. |
| C | Signed URLs en `src/app/api/invoices/tango/emit/route.ts` y `src/app/api/supplier-offers/parse-pdf/route.ts` | Ambos ya usan `createSignedUrl` (`tango/emit:174`, `supplier-offers/parse-pdf:201`). Sin `getPublicUrl`. |
| D | Resolver bucket `attachments` (crear migración o cambiar a bucket existente) | Bucket creado en `supabase/migration-v51-attachments-bucket.sql` (privado, 50 MB) y referenciado en `migration-v68-document-attachments.sql`. Aplicación en prod debe verificarse con `SELECT * FROM storage.buckets WHERE id='attachments';`. |

**Hipótesis:** la auditoría se generó sobre un commit anterior a las PRs #39–#44 (2026-05-10). Si necesitás una auditoría fresca, generala sobre el `main` actual.

---

## En curso — IVA por cliente × empresa (branch `feat/iva-por-cliente-empresa`)

**Pasos completados:**
- v70 migración: tabla `tt_client_company_tax_config(client_id, company_id, subject_iva, iva_rate, subject_irpf, irpf_rate, subject_re, re_rate, notes)` con RLS y trigger `updated_at`. **Aplicada en prod.**
- Helper `src/lib/tax-config.ts` con `resolveTaxConfig(supabase, clientId, companyId)` y `resolveTaxConfigFromClient(...)`. Devuelve `{...config, source: 'override' | 'client_default' | 'fallback'}`.

**Pendiente:**
- Paso 3: UI en `src/components/clientes/client-detail-modal.tsx` — sección "Overrides por empresa".
- Paso 4: lookup en `src/app/(dashboard)/cotizador/page.tsx` — al seleccionar cliente o cambiar empresa, llamar `resolveTaxConfig`.
- Paso 5: lookup en `src/components/workflow/document-form.tsx` — mismo patrón.
